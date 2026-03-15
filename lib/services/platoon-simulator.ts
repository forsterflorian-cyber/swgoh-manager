import { computePlatoonMatching } from '@/lib/services/platoon-matching';

import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorDelta,
  PlatoonSimulatorResponse,
} from '@/lib/types/platoon-simulator';
import type { StrategicPlannerDataset } from '@/lib/types/platoon-readiness';

type AnyRecord = Record<string, unknown>;

type DatasetRosterEntry = {
  memberId: string;
  unitBaseId: string;
  rarity: number | null;
  relicTier: number | null;
  allyCode?: string | null;
  playerName?: string | null;
  unitName?: string | null;
  gearLevel?: number | null;
};
type DatasetSlot = StrategicPlannerDataset['slots'][number] & {
  slotKey: string;
  unitBaseId: string;
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
  requiredRarity: number | null;
  requiredRelicTier: number | null;
  eligibleRoster?: DatasetRosterEntry[];
};

type MatchingLike = ReturnType<typeof computePlatoonMatching>;

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

function getNumber(record: AnyRecord | null | undefined, ...keys: string[]): number | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getPlatoonIdFromSlot(slot: {
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
}): string {
  return `${String(slot.phase)}::${slot.zoneKey}::${slot.platoonKey}`;
}

function getCoveredSlotsByPlatoon(result: MatchingLike): Map<string, Set<string>> {
  const byPlatoon = new Map<string, Set<string>>();
  const resultRecord = result as unknown as AnyRecord;

  if (!Array.isArray(resultRecord.assignments)) {
    return byPlatoon;
  }

  for (const assignment of resultRecord.assignments as AnyRecord[]) {
    const requirementId = getString(assignment, 'requirementId');
    const phase =
      getNumber(assignment, 'phase')?.toString() ??
      getString(assignment, 'phase');
    const zoneKey = getString(assignment, 'zoneKey');
    const platoonKey = getString(assignment, 'platoonKey');

    if (!requirementId || !phase || !zoneKey || !platoonKey) {
      continue;
    }

    const platoonId = `${phase}::${zoneKey}::${platoonKey}`;
    const covered = byPlatoon.get(platoonId) ?? new Set<string>();
    covered.add(requirementId);
    byPlatoon.set(platoonId, covered);
  }

  return byPlatoon;
}
function buildPlatoonIdFromCoverageRecord(record: AnyRecord): string | null {
  const phase = getString(record, 'phase') ?? getNumber(record, 'phase')?.toString() ?? null;
  const zoneKey = getString(record, 'zoneKey');
  const platoonKey = getString(record, 'platoonKey');

  if (!phase || !zoneKey || !platoonKey) {
    return null;
  }

  return `${phase}::${zoneKey}::${platoonKey}`;
}

function countCoveredSlots(result: MatchingLike): number {
  const resultRecord = result as unknown as AnyRecord;

  if (Array.isArray(resultRecord.assignments)) {
    return resultRecord.assignments.length;
  }

  if (Array.isArray(resultRecord.coverage)) {
    return (resultRecord.coverage as AnyRecord[]).reduce((sum, platoon) => {
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

  return 0;
}

function getFullPlatoonIds(result: MatchingLike): string[] {
  const resultRecord = result as unknown as AnyRecord;

  if (!Array.isArray(resultRecord.coverage)) {
    return [];
  }

  return (resultRecord.coverage as AnyRecord[])
    .filter((entry) => {
      const assignedCount = getNumber(entry, 'assignedCount') ?? 0;
      const requirementCount = getNumber(entry, 'requirementCount') ?? 0;
      return requirementCount > 0 && assignedCount >= requirementCount;
    })
    .map((entry) => {
      const phase =
        getNumber(entry, 'phase')?.toString() ??
        getString(entry, 'phase');
      const category = getString(entry, 'category');

      if (!phase || !category) {
        return '';
      }

      return `${phase}::${category}`;
    })
    .filter(Boolean);
}
function countFullPlatoons(result: MatchingLike): number {
  const resultRecord = result as unknown as AnyRecord;

  if (!Array.isArray(resultRecord.coverage)) {
    return 0;
  }

  return (resultRecord.coverage as AnyRecord[]).filter((entry) => {
    const assignedCount = getNumber(entry, 'assignedCount') ?? 0;
    const requirementCount = getNumber(entry, 'requirementCount') ?? 0;
    return requirementCount > 0 && assignedCount >= requirementCount;
  }).length;
}
function getAssignmentKeys(result: MatchingLike): Set<string> {
  const keys = new Set<string>();
  const resultRecord = result as unknown as AnyRecord;

  if (!Array.isArray(resultRecord.assignments)) {
    return keys;
  }

  for (const assignment of resultRecord.assignments as AnyRecord[]) {
    const requirementId = getString(assignment, 'requirementId');
    const memberId = getString(assignment, 'memberId');

    if (requirementId && memberId) {
      keys.add(`${requirementId}::${memberId}`);
    }
  }

  return keys;
}
function buildDelta(
  baseline: MatchingLike,
  simulated: MatchingLike,
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

function buildSyntheticRosterEntry(
  action: Extract<PlatoonSimulatorAction, { type: 'ADD_HYPOTHETICAL_UNIT' }>,
  index: number,
): StrategicPlannerDataset['roster'][number] {
  return {
    memberId: `${action.memberId}_sim_${index}`,
    allyCode: `SIM-${index}`,
    playerName: `[sim] ${action.memberId}`,
    unitBaseId: action.unitBaseId,
    unitName: action.unitBaseId,
    rarity: action.rarity ?? 0,
    relicTier: action.relicTier ?? 0,
    gearLevel: 0,
  } as StrategicPlannerDataset['roster'][number];
}

function isRosterEntryEligibleForSlot(
  rosterEntry: {
    unitBaseId: string;
    rarity: number | null;
    relicTier: number | null;
  },
  slot: {
    unitBaseId: string;
    requiredRarity: number | null;
    requiredRelicTier: number | null;
  },
): boolean {
  return (
    rosterEntry.unitBaseId === slot.unitBaseId &&
    (rosterEntry.rarity ?? 0) >= (slot.requiredRarity ?? 0) &&
    (rosterEntry.relicTier ?? 0) >= (slot.requiredRelicTier ?? 0)
  );
}

function cloneSlotForSimulation(slot: StrategicPlannerDataset['slots'][number]): DatasetSlot {
  const slotRecord = slot as DatasetSlot;

  return {
    ...slotRecord,
    eligibleRoster: Array.isArray(slotRecord.eligibleRoster)
      ? [...slotRecord.eligibleRoster]
      : [],
  };
}

function cloneDatasetForSimulation(dataset: StrategicPlannerDataset): StrategicPlannerDataset {
  return {
    ...dataset,
    members: [...dataset.members],
    roster: [...dataset.roster],
    slots: dataset.slots.map(cloneSlotForSimulation),
    strategicAssignments: Array.isArray(dataset.strategicAssignments)
      ? [...dataset.strategicAssignments]
      : [],
  };
}

function upsertEligibleRosterEntryLocal(
  dataset: StrategicPlannerDataset,
  slot: DatasetSlot,
  memberId: string,
): void {
  const slotUnitBaseId = slot.unitBaseId;

  if (!slot.eligibleRoster) {
    slot.eligibleRoster = [];
  }

  const alreadyExists = slot.eligibleRoster.some((entry) => {
    const entryRecord = entry as unknown as AnyRecord;
    const entryMemberId = getString(entryRecord, 'memberId', 'playerId');
    return entryMemberId === memberId;
  });

  if (alreadyExists) {
    return;
  }

  const rosterEntry = (dataset.roster as  unknown as AnyRecord[]).find((entry) => {
    const rosterMemberId = getString(entry, 'memberId', 'playerId');
    const rosterUnitBaseId = getString(entry, 'unitBaseId', 'baseId', 'defId');

    return rosterMemberId === memberId && rosterUnitBaseId === slotUnitBaseId;
  });

  if (rosterEntry) {
    slot.eligibleRoster.push(rosterEntry  as unknown as DatasetRosterEntry);
    return;
  }

  slot.eligibleRoster.push({
    memberId,
    unitBaseId: slotUnitBaseId,
    rarity: slot.requiredRarity ?? 0,
    relicTier: slot.requiredRelicTier ?? 0,
  });
}

function findSlotByKeyLocal(
  dataset: StrategicPlannerDataset,
  slotKey: string,
): DatasetSlot | undefined {
  return dataset.slots.find((slot) => {
    const record = slot  as unknown as AnyRecord;
    return typeof record.slotKey === 'string' && record.slotKey === slotKey;
  }) as DatasetSlot | undefined;
}

function removeStrategicBlockLocal(
  dataset: StrategicPlannerDataset,
  action: Extract<PlatoonSimulatorAction, { type: 'REMOVE_SOURCE_BLOCK' }>,
): void {
  dataset.strategicAssignments = dataset.strategicAssignments.filter((assignment) => {
    const record = assignment  as unknown as AnyRecord;

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
function ensureSyntheticMemberExists(
  dataset: StrategicPlannerDataset,
  memberId: string,
  playerName: string,
): void {
  const exists = dataset.members.some((member) => member.memberId === memberId);

  if (exists) {
    return;
  }

  dataset.members.push({
    memberId,
    playerName,
    allyCode: `SIM-${memberId}`,
    galacticPower: 0,
    lastSynced: new Date(0).toISOString(),
  } as StrategicPlannerDataset['members'][number]);
}
function applySingleAction(
  dataset: StrategicPlannerDataset,
  action: PlatoonSimulatorAction,
  syntheticIndexRef: { value: number },
): void {
  switch (action.type) {
case 'ADD_HYPOTHETICAL_UNIT': {
  const syntheticEntry = buildSyntheticRosterEntry(action, syntheticIndexRef.value);
  syntheticIndexRef.value += 1;

  ensureSyntheticMemberExists(
    dataset,
    syntheticEntry.memberId,
    syntheticEntry.playerName,
  );

  dataset.roster.push(syntheticEntry);

  let eligibleHits = 0;

  for (const slot of dataset.slots as DatasetSlot[]) {
    if (
      isRosterEntryEligibleForSlot(
        {
          unitBaseId: syntheticEntry.unitBaseId,
          rarity: syntheticEntry.rarity ?? 0,
          relicTier: syntheticEntry.relicTier ?? 0,
        },
        slot,
      )
    ) {
      if (!Array.isArray(slot.eligibleRoster)) {
        slot.eligibleRoster = [];
      }

      slot.eligibleRoster.push({
        memberId: syntheticEntry.memberId,
        unitBaseId: syntheticEntry.unitBaseId,
        rarity: syntheticEntry.rarity ?? 0,
        relicTier: syntheticEntry.relicTier ?? 0,
        allyCode: syntheticEntry.allyCode ?? null,
        playerName: syntheticEntry.playerName ?? '[sim]',
        unitName: syntheticEntry.unitName ?? syntheticEntry.unitBaseId,
        gearLevel: syntheticEntry.gearLevel ?? 0,
      } as DatasetRosterEntry);

      eligibleHits += 1;
    }
  }

  console.log('[sim add]', {
    syntheticMemberId: syntheticEntry.memberId,
    syntheticUnitBaseId: syntheticEntry.unitBaseId,
    rosterCount: dataset.roster.length,
    membersCount: dataset.members.length,
    eligibleHits,
  });

  return;
}

    case 'MAKE_SLOT_ELIGIBLE': {
      const slot = findSlotByKeyLocal(dataset, action.slotKey);
      if (!slot) return;

      upsertEligibleRosterEntryLocal(dataset, slot, action.memberId);
      return;
    }

    case 'REMOVE_SOURCE_BLOCK': {
      removeStrategicBlockLocal(dataset, action);
      return;
    }

    default: {
      const unknownAction = action as { type?: string };
      throw new Error(`Unsupported action type: ${String(unknownAction.type)}`);
    }
  }
}

function simulateStepEffects(
  _dataset: StrategicPlannerDataset,
  _actions: PlatoonSimulatorAction[],
): PlatoonSimulatorResponse['steps'] {
  return [];
}

export function applySimulationActions(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
): StrategicPlannerDataset {
  if (actions.length === 0) {
    return dataset;
  }

  const nextDataset = cloneDatasetForSimulation(dataset);
  const syntheticIndexRef = { value: 0 };

  for (const action of actions) {
    applySingleAction(nextDataset, action, syntheticIndexRef);
  }

  return nextDataset;
}

export function simulatePlatoonScenario(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
  precomputedBaseline?: MatchingLike,
): PlatoonSimulatorResponse {
  const baseline = precomputedBaseline ?? computePlatoonMatching(dataset);

  const simulatedDataset = applySimulationActions(dataset, actions);
  const firstAction = actions[0];

if (firstAction?.type === 'ADD_HYPOTHETICAL_UNIT') {
  const matchingSlots = simulatedDataset.slots.filter((slot) => {
    const s = slot as unknown as {
      unitBaseId?: string;
      eligibleRoster?: Array<{ memberId?: string; unitBaseId?: string }>;
      requirementId?: string;
      slotKey?: string;
      platoonKey?: string;
      zoneKey?: string;
      phase?: string | number;
    };

    return s.unitBaseId === firstAction.unitBaseId;
  });

  console.log('[sim debug] first action visibility', {
    actionMemberId: firstAction.memberId,
    actionUnitBaseId: firstAction.unitBaseId,
    matchingSlots: matchingSlots.length,
    firstSlots: matchingSlots.slice(0, 5).map((slot) => {
      const s = slot as unknown as {
        requirementId?: string;
        slotKey?: string;
        eligibleRoster?: Array<{ memberId?: string; unitBaseId?: string }>;
      };

      const syntheticEligible = Array.isArray(s.eligibleRoster)
        ? s.eligibleRoster.filter((entry) =>
            typeof entry.memberId === 'string' &&
            (entry.memberId.includes('_sim_') || entry.memberId.includes('__sim__')),
          ).map((entry) => entry.memberId)
        : [];

      return {
        slotKey: s.requirementId ?? s.slotKey ?? null,
        syntheticEligibleCount: syntheticEligible.length,
        syntheticEligible,
      };
    }),
  });
}
  const simulated = computePlatoonMatching(simulatedDataset);
  const delta = buildDelta(baseline, simulated);

  const coverageByPlatoon = getCoveredSlotsByPlatoon(simulated);
  const targetPlatoonId =
    actions.length > 0 && 'slotKey' in actions[0] && typeof actions[0].slotKey === 'string'
      ? null
      : null;
console.log('[simulator] baseline raw', {
  coveredSlots: (baseline as unknown as Record<string, unknown>).coveredSlots,
  fullPlatoons: (baseline as unknown as Record<string, unknown>).fullPlatoons,
  assignments: Array.isArray((baseline as unknown as Record<string, unknown>).assignments)
    ? ((baseline as unknown as Record<string, unknown>).assignments as unknown[]).length
    : null,
  coverage: Array.isArray((baseline as unknown as Record<string, unknown>).coverage)
    ? ((baseline as unknown as Record<string, unknown>).coverage as unknown[]).length
    : null,
});

console.log('[simulator] simulated raw', {
  coveredSlots: (simulated as unknown as Record<string, unknown>).coveredSlots,
  fullPlatoons: (simulated as unknown as Record<string, unknown>).fullPlatoons,
  assignments: Array.isArray((simulated as unknown as Record<string, unknown>).assignments)
    ? ((simulated as unknown as Record<string, unknown>).assignments as unknown[]).length
    : null,
  coverage: Array.isArray((simulated as unknown as Record<string, unknown>).coverage)
    ? ((simulated as unknown as Record<string, unknown>).coverage as unknown[]).length
    : null,
});
  return {
    baseline,
    simulatedDataset,
    simulated,
    delta,
    steps: simulateStepEffects(simulatedDataset, actions),
    targetPlatoonId,
    simulatedCoverageByPlatoon: coverageByPlatoon,
  } as PlatoonSimulatorResponse;
}