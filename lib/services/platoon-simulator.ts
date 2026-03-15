import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorDelta,
  PlatoonSimulatorResponse,
} from '@/lib/types/platoon-simulator';
import type { StrategicPlannerDataset } from '@/lib/types/platoon-readiness';



export function simulatePlatoonScenario(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
  precomputedBaseline?: ReturnType<typeof computePlatoonMatching>,
): PlatoonSimulatorResponse {
  const baseline = precomputedBaseline ?? computePlatoonMatching(dataset);

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

type AnyRecord = Record<string, unknown>;

type SimulatedEligibleRosterEntry = AnyRecord;

type SimulatedSlot = StrategicPlannerDataset['slots'][number] & {
  eligibleRoster?: SimulatedEligibleRosterEntry[];
};

type SimulatedAssignment = StrategicPlannerDataset['strategicAssignments'][number];

export function applySimulationActions(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
): StrategicPlannerDataset {
  if (actions.length === 0) {
    return dataset;
  }

  const cloned: StrategicPlannerDataset = {
    ...dataset,
    slots: dataset.slots.map((slot) => cloneSlotForSimulation(slot)),
    strategicAssignments: Array.isArray(dataset.strategicAssignments)
      ? dataset.strategicAssignments.map((assignment) => ({ ...assignment }))
      : ([] as SimulatedAssignment[]),
  };

  for (const action of actions) {
    if (action.type === 'MAKE_SLOT_ELIGIBLE') {
      const slot = findSlotByKeyLocal(cloned, action.slotKey);
      if (!slot) continue;

      upsertEligibleRosterEntryLocal(cloned, slot, action.memberId);
      continue;
    }

    if (action.type === 'REMOVE_SOURCE_BLOCK') {
      removeStrategicBlockLocal(cloned, action);
    }
  }

  return cloned;
}

function cloneSlotForSimulation(
  slot: StrategicPlannerDataset['slots'][number],
): StrategicPlannerDataset['slots'][number] {
  const simulatedSlot = slot as unknown as SimulatedSlot;

  return {
    ...slot,
    ...(Array.isArray(simulatedSlot.eligibleRoster)
      ? { eligibleRoster: [...simulatedSlot.eligibleRoster] }
      : {}),
  };
}

function findSlotByKeyLocal(
  dataset: StrategicPlannerDataset,
  slotKey: string,
): SimulatedSlot | undefined {
  return dataset.slots.find((slot) => {
    const record = slot as unknown as AnyRecord;
    return typeof record.slotKey === 'string' && record.slotKey === slotKey;
  }) as SimulatedSlot | undefined;
}

function getString(record: AnyRecord | null | undefined, ...keys: string[]): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function upsertEligibleRosterEntryLocal(
  dataset: StrategicPlannerDataset,
  slot: SimulatedSlot,
  memberId: string,
): void {
  const slotRecord = slot as unknown as AnyRecord;
  const slotUnitBaseId = getString(slotRecord, 'unitBaseId');

  if (!slot.eligibleRoster) {
    slot.eligibleRoster = [];
  }

  const alreadyExists = slot.eligibleRoster.some((entry) => {
    const record = entry as AnyRecord;
    const entryMemberId = getString(record, 'memberId', 'playerId');
    return entryMemberId === memberId;
  });

  if (alreadyExists) {
    return;
  }

  const rosterEntry = (dataset.roster as unknown as AnyRecord[]).find((entry) => {
    const rosterMemberId = getString(entry, 'memberId', 'playerId');
    const rosterUnitBaseId = getString(entry, 'unitBaseId', 'baseId', 'defId');

    return rosterMemberId === memberId && rosterUnitBaseId === slotUnitBaseId;
  });

  if (rosterEntry) {
    slot.eligibleRoster.push({ ...rosterEntry });
    return;
  }

  slot.eligibleRoster.push({
    memberId,
    unitBaseId: slotUnitBaseId,
  });
}

function removeStrategicBlockLocal(
  dataset: StrategicPlannerDataset,
  action: Extract<PlatoonSimulatorAction, { type: 'REMOVE_SOURCE_BLOCK' }>,
): void {
  dataset.strategicAssignments = dataset.strategicAssignments.filter((assignment) => {
    const record = assignment as unknown as AnyRecord;

    const memberId = getString(record, 'memberId');
    const unitBaseId = getString(record, 'unitBaseId');
    const planetCategory = getString(record, 'planetCategory');
    const blockType = getString(record, 'blockType');

    const sameMember = memberId === action.memberId;
    const sameUnit = unitBaseId === action.unitBaseId;
    const samePlanet = (planetCategory ?? null) === (action.planetCategory ?? null);
    const sameBlockType = blockType === action.blockType;

    return !(sameMember && sameUnit && samePlanet && sameBlockType);
  });
}

function buildDelta(
  baseline: any,
  simulated: any,
): PlatoonSimulatorDelta {
  const baselineCoveredSlots = countCoveredSlots(baseline);
  const simulatedCoveredSlots = countCoveredSlots(simulated);

  const baselineFullPlatoons = countFullPlatoons(baseline);
  const simulatedFullPlatoons = countFullPlatoons(simulated);

  const baselineFullIds = new Set(getFullPlatoonIds(baseline));
  const simulatedFullIds = new Set(getFullPlatoonIds(simulated));

  const becameFullPlatoonIds = [...simulatedFullIds]
    .filter((id) => !baselineFullIds.has(id))
    .sort();

  const noLongerFullPlatoonIds = [...baselineFullIds]
    .filter((id) => !simulatedFullIds.has(id))
    .sort();

  const baselineAssignments = getAssignmentKeys(baseline);
  const simulatedAssignments = getAssignmentKeys(simulated);

  const removedAssignmentCount = [...baselineAssignments].filter(
    (key) => !simulatedAssignments.has(key),
  ).length;

  const addedAssignmentCount = [...simulatedAssignments].filter(
    (key) => !baselineAssignments.has(key),
  ).length;

  const changedAssignmentCount = Math.max(removedAssignmentCount, addedAssignmentCount);
  const displacedAssignmentCount = removedAssignmentCount;

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

/**
 * Die folgenden Helper greifen bewusst tolerant auf das bestehende Matching-Shape zu.
 * Damit muss nicht noch ein dritter Typenumbau parallel gemacht werden.
 */
function countCoveredSlots(result: any): number {
  if (!result || !Array.isArray(result.coverage)) return 0;

  return result.coverage.reduce((sum: number, platoon: any) => {
    const covered = Array.isArray(platoon.assignments)
      ? platoon.assignments.length
      : Array.isArray(platoon.coveredSlots)
        ? platoon.coveredSlots.length
        : typeof platoon.coveredSlotsCount === 'number'
          ? platoon.coveredSlotsCount
          : 0;

    return sum + covered;
  }, 0);
}

function countFullPlatoons(result: any): number {
  return getFullPlatoonIds(result).length;
}

function getFullPlatoonIds(result: any): string[] {
  if (!result || !Array.isArray(result.coverage)) return [];

  return result.coverage
    .filter((platoon: any) => {
      const covered = Array.isArray(platoon.assignments)
        ? platoon.assignments.length
        : Array.isArray(platoon.coveredSlots)
          ? platoon.coveredSlots.length
          : typeof platoon.coveredSlotsCount === 'number'
            ? platoon.coveredSlotsCount
            : 0;

      const total = Array.isArray(platoon.slots)
        ? platoon.slots.length
        : typeof platoon.totalSlots === 'number'
          ? platoon.totalSlots
          : 0;

      return total > 0 && covered >= total;
    })
    .map((platoon: any) => {
      if (typeof platoon.platoonId === 'string') return platoon.platoonId;
      if (typeof platoon.targetPlatoonId === 'string') return platoon.targetPlatoonId;
      if (typeof platoon.id === 'string') return platoon.id;
      return '';
    })
    .filter(Boolean);
}

function getAssignmentKeys(result: any): Set<string> {
  const keys = new Set<string>();

  if (!result || !Array.isArray(result.coverage)) {
    return keys;
  }

  for (const platoon of result.coverage) {
    const assignments = Array.isArray(platoon.assignments) ? platoon.assignments : [];

    for (const assignment of assignments) {
      const slotKey =
        typeof assignment?.slotKey === 'string'
          ? assignment.slotKey
          : typeof assignment?.slot?.slotKey === 'string'
            ? assignment.slot.slotKey
            : null;

      const memberId =
        typeof assignment?.memberId === 'string'
          ? assignment.memberId
          : typeof assignment?.sourceMemberId === 'string'
            ? assignment.sourceMemberId
            : null;

      if (slotKey && memberId) {
        keys.add(`${slotKey}::${memberId}`);
      }
    }
  }

  return keys;
}

function simulateStepEffects(
  _dataset: StrategicPlannerDataset,
  _actions: PlatoonSimulatorAction[],
): PlatoonSimulatorResponse['steps'] {
  return [];
}