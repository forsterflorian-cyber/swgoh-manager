import type {
  PlatoonMatchingCoverage,
  PlatoonMatchingResult,
  StrategicPlannerDataset,
  StrategicPlannerMemberInput,
  StrategicPlannerRosterInput,
  StrategicPlannerSlotInput,
} from '@/lib/types/platoon-readiness';
import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorDelta,
  PlatoonSimulatorResponse,
  PlatoonSimulatorStepEffect,
} from '@/lib/types/platoon-simulator';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import { UnitCategory } from '@/lib/types/platoon-readiness';

function readCoverageCoveredSlots(item: PlatoonMatchingCoverage): number {
  const candidate = item as unknown as Record<string, unknown>;

  const possibleKeys = [
    'coveredSlots',
    'assignedSlots',
    'filledSlots',
    'matchedSlots',
    'countCovered',
    'countAssigned',
  ];

  for (const key of possibleKeys) {
    const value = candidate[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function readCoverageTotalSlots(item: PlatoonMatchingCoverage): number {
  const candidate = item as unknown as Record<string, unknown>;

  const possibleKeys = ['totalSlots', 'requiredSlots', 'slotCount', 'total', 'countTotal'];

  for (const key of possibleKeys) {
    const value = candidate[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function readCoveragePlatoonId(item: PlatoonMatchingCoverage): string | null {
  const candidate = item as unknown as Record<string, unknown>;

  const possibleKeys = ['platoonId', 'targetPlatoonId', 'id', 'key'];

  for (const key of possibleKeys) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function countCoveredSlots(result: PlatoonMatchingResult): number {
  return result.coverage.reduce((sum, item) => sum + readCoverageCoveredSlots(item), 0);
}

function countFullPlatoons(result: PlatoonMatchingResult): number {
  return result.coverage.filter((item) => {
    const covered = readCoverageCoveredSlots(item);
    const total = readCoverageTotalSlots(item);
    return total > 0 && covered >= total;
  }).length;
}

function getFullPlatoonIds(result: PlatoonMatchingResult): string[] {
  return result.coverage
    .filter((item) => {
      const covered = readCoverageCoveredSlots(item);
      const total = readCoverageTotalSlots(item);
      return total > 0 && covered >= total;
    })
    .map((item) => readCoveragePlatoonId(item))
    .filter((value): value is string => !!value);
}

function getAssignmentKeys(result: PlatoonMatchingResult): Set<string> {
  return new Set(
    result.assignments.map((item) => {
      const candidate = item as unknown as Record<string, unknown>;

      const platoonId =
        typeof candidate.platoonId === 'string' ? candidate.platoonId : 'unknown-platoon';
      const slotId =
        typeof candidate.slotId === 'string' ? candidate.slotId : 'unknown-slot';
      const ownerKey =
        typeof candidate.ownerKey === 'string' ? candidate.ownerKey : 'unknown-owner';

      return `${platoonId}::${slotId}::${ownerKey}`;
    }),
  );
}

function buildDelta(
  baseline: PlatoonMatchingResult,
  simulated: PlatoonMatchingResult,
): PlatoonSimulatorDelta {
  const baselineCoveredSlots = countCoveredSlots(baseline);
  const simulatedCoveredSlots = countCoveredSlots(simulated);

  const baselineFullPlatoons = countFullPlatoons(baseline);
  const simulatedFullPlatoons = countFullPlatoons(simulated);

  const baselineFullIds = new Set(getFullPlatoonIds(baseline));
  const simulatedFullIds = new Set(getFullPlatoonIds(simulated));

  const becameFullPlatoonIds = [...simulatedFullIds].filter((id) => !baselineFullIds.has(id));
  const noLongerFullPlatoonIds = [...baselineFullIds].filter((id) => !simulatedFullIds.has(id));

  const baselineAssignments = getAssignmentKeys(baseline);
  const simulatedAssignments = getAssignmentKeys(simulated);

  const changedAssignmentCount =
    [...baselineAssignments].filter((key) => !simulatedAssignments.has(key)).length +
    [...simulatedAssignments].filter((key) => !baselineAssignments.has(key)).length;

  const displacedAssignmentCount = [...baselineAssignments].filter(
    (key) => !simulatedAssignments.has(key),
  ).length;

  return {
    baselineCoveredSlots,
    simulatedCoveredSlots,
    deltaCoveredSlots: simulatedCoveredSlots - baselineCoveredSlots,
    baselineFullPlatoons,
    simulatedFullPlatoons,
    deltaFullPlatoons: simulatedFullPlatoons - baselineFullPlatoons,
    changedAssignmentCount,
    displacedAssignmentCount,
    becameFullPlatoonIds,
    noLongerFullPlatoonIds,
  };
}

function findSlotByKey(
  dataset: StrategicPlannerDataset,
  slotKey: string,
): StrategicPlannerSlotInput | null {
  return dataset.slots.find((slot) => slot.slotKey === slotKey) ?? null;
}

function findMemberById(
  dataset: StrategicPlannerDataset,
  memberId: string,
): StrategicPlannerMemberInput | null {
  return dataset.members.find((member) => member.memberId === memberId) ?? null;
}

function upsertEligibleRosterEntry(
  dataset: StrategicPlannerDataset,
  slot: StrategicPlannerSlotInput,
  memberId: string,
): void {
  const existing = dataset.roster.find(
    (row) => row.memberId === memberId && row.unitBaseId === slot.unitBaseId,
  );

  if (existing) {
    existing.relicTier = Math.max(existing.relicTier, slot.requiredRelicTier);
    existing.rarity = Math.max(existing.rarity, slot.requiredRarity);

    if (slot.unitCategory !== 'SHIP') {
      existing.gearLevel = Math.max(existing.gearLevel, 13);
    }

    return;
  }

  const member = findMemberById(dataset, memberId);
  if (!member) return;

  const simulatedRow: StrategicPlannerRosterInput = {
    memberId: member.memberId,
    allyCode: member.allyCode,
    playerName: member.playerName,
    unitBaseId: slot.unitBaseId,
    unitName: slot.unitName ?? slot.unitBaseId,
    relicTier: slot.requiredRelicTier,
    rarity: slot.requiredRarity,
    gearLevel: slot.unitCategory === 'SHIP' ? 0 : 13,
  };

  dataset.roster.push(simulatedRow);
}

function removeStrategicBlock(
  dataset: StrategicPlannerDataset,
  action: Extract<PlatoonSimulatorAction, { type: 'REMOVE_SOURCE_BLOCK' }>,
): void {
  dataset.strategicAssignments = dataset.strategicAssignments.filter(
    (assignment) =>
      !(
        assignment.guildMemberId === action.memberId &&
        assignment.unitBaseId === action.unitBaseId &&
        assignment.planetCategory === action.planetCategory
      ),
  );
}

/**
 * Actions verändern nur den Dataset-Input.
 * Danach wird das Matching vollständig neu berechnet.
 */
export function applySimulationActions(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
): StrategicPlannerDataset {
  const cloned: StrategicPlannerDataset = structuredClone(dataset);

  for (const action of actions) {
    if (action.type === 'MAKE_SLOT_ELIGIBLE') {
      const slot = findSlotByKey(cloned, action.slotKey);
      if (!slot) continue;

      upsertEligibleRosterEntry(cloned, slot, action.memberId);
      continue;
    }

    if (action.type === 'REMOVE_SOURCE_BLOCK') {
      removeStrategicBlock(cloned, action);
    }
  }

  return cloned;
}

function simulateStepEffects(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
): PlatoonSimulatorStepEffect[] {
  const steps: PlatoonSimulatorStepEffect[] = [];

  let currentDataset: StrategicPlannerDataset = structuredClone(dataset);
  let currentMatching = computePlatoonMatching(currentDataset);

  for (const action of actions) {
    const coveredSlotsBefore = countCoveredSlots(currentMatching);
    const fullPlatoonsBefore = countFullPlatoons(currentMatching);

    currentDataset = applySimulationActions(currentDataset, [action]);
    const nextMatching = computePlatoonMatching(currentDataset);

    const coveredSlotsAfter = countCoveredSlots(nextMatching);
    const fullPlatoonsAfter = countFullPlatoons(nextMatching);
    const becameFullPlatoonIds = buildDelta(currentMatching, nextMatching).becameFullPlatoonIds;

    steps.push({
      actionId: action.id,
      coveredSlotsBefore,
      coveredSlotsAfter,
      fullPlatoonsBefore,
      fullPlatoonsAfter,
      becameFullPlatoonIds,
    });

    currentMatching = nextMatching;
  }

  return steps;
}

export function simulatePlatoonScenario(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
): PlatoonSimulatorResponse {
  const baseline = computePlatoonMatching(dataset);

  const simulatedDataset = applySimulationActions(dataset, actions);
  const simulated = computePlatoonMatching(simulatedDataset);

  const delta = buildDelta(baseline, simulated);
  const steps = simulateStepEffects(dataset, actions);

  return {
    baseline,
    simulated,
    delta,
    steps,
  };
}