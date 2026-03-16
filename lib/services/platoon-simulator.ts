import { computePlatoonMatching } from '@/lib/services/platoon-matching';

import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorDelta,
  PlatoonSimulatorResponse,
} from '@/lib/types/platoon-simulator';
import type { StrategicPlannerDataset } from '@/lib/types/platoon-readiness';

type AnyRecord = Record<string, unknown>;
type MatchingLike = ReturnType<typeof computePlatoonMatching>;

type DatasetSlot = StrategicPlannerDataset['slots'][number] & {
  slotKey?: string;
  requirementId?: string;
  unitBaseId: string;
  unitName?: string | null;
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
  requiredRarity: number | null;
  requiredRelicTier: number | null;
};

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

function getSlotKey(slot: StrategicPlannerDataset['slots'][number]): string | null {
  const s = slot as unknown as AnyRecord;

  return (
    getString(s, 'requirementId', 'slotKey', 'key')
  );
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

function countCoveredSlots(result: MatchingLike): number {
  const resultRecord = result as unknown as AnyRecord;

  if (Array.isArray(resultRecord.assignments)) {
    return resultRecord.assignments.length;
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
function buildPlatoonIdFromAssignment(assignment: AnyRecord): string | null {
  const phase =
    getNumber(assignment, 'phase')?.toString() ??
    getString(assignment, 'phase');
  const zoneKey = getString(assignment, 'zoneKey');
  const platoonKey = getString(assignment, 'platoonKey');

  if (!phase || !zoneKey || !platoonKey) {
    return null;
  }

  return `${phase}::${zoneKey}::${platoonKey}`;
}

function countFullZones(result: MatchingLike): number {
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

function getFullZoneIds(result: MatchingLike): string[] {
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

function countFullPlatoonsFromAssignments(
  dataset: StrategicPlannerDataset,
  result: MatchingLike,
): number {
  const resultRecord = result as unknown as AnyRecord;

  const totalByPlatoon = new Map<string, number>();
  for (const slot of dataset.slots as DatasetSlot[]) {
    const platoonId = getPlatoonIdFromSlot(slot);
    totalByPlatoon.set(platoonId, (totalByPlatoon.get(platoonId) ?? 0) + 1);
  }

  const assignedByPlatoon = new Map<string, number>();
  if (Array.isArray(resultRecord.assignments)) {
    for (const assignment of resultRecord.assignments as AnyRecord[]) {
      const platoonId = buildPlatoonIdFromAssignment(assignment);
      if (!platoonId) continue;
      assignedByPlatoon.set(platoonId, (assignedByPlatoon.get(platoonId) ?? 0) + 1);
    }
  }

  let fullCount = 0;
  for (const [platoonId, total] of totalByPlatoon.entries()) {
    const assigned = assignedByPlatoon.get(platoonId) ?? 0;
    if (total > 0 && assigned >= total) {
      fullCount += 1;
    }
  }

  return fullCount;
}

function getFullPlatoonIdsFromAssignments(
  dataset: StrategicPlannerDataset,
  result: MatchingLike,
): string[] {
  const resultRecord = result as unknown as AnyRecord;

  const totalByPlatoon = new Map<string, number>();
  for (const slot of dataset.slots as DatasetSlot[]) {
    const platoonId = getPlatoonIdFromSlot(slot);
    totalByPlatoon.set(platoonId, (totalByPlatoon.get(platoonId) ?? 0) + 1);
  }

  const assignedByPlatoon = new Map<string, number>();
  if (Array.isArray(resultRecord.assignments)) {
    for (const assignment of resultRecord.assignments as AnyRecord[]) {
      const platoonId = buildPlatoonIdFromAssignment(assignment);
      if (!platoonId) continue;
      assignedByPlatoon.set(platoonId, (assignedByPlatoon.get(platoonId) ?? 0) + 1);
    }
  }

  const fullIds: string[] = [];
  for (const [platoonId, total] of totalByPlatoon.entries()) {
    const assigned = assignedByPlatoon.get(platoonId) ?? 0;
    if (total > 0 && assigned >= total) {
      fullIds.push(platoonId);
    }
  }

  return fullIds.sort();
}

function buildDelta(
  dataset: StrategicPlannerDataset,
  baseline: MatchingLike,
  simulated: MatchingLike,
): PlatoonSimulatorDelta {
  const baselineCoveredSlots = countCoveredSlots(baseline);
  const simulatedCoveredSlots = countCoveredSlots(simulated);

  const baselineFullPlatoons = countFullPlatoonsFromAssignments(dataset, baseline);
  const simulatedFullPlatoons = countFullPlatoonsFromAssignments(dataset, simulated);

  const baselineFullZones = countFullZones(baseline);
  const simulatedFullZones = countFullZones(simulated);

  const baselineFullPlatoonIds = new Set(getFullPlatoonIdsFromAssignments(dataset, baseline));
  const simulatedFullPlatoonIds = new Set(getFullPlatoonIdsFromAssignments(dataset, simulated));

  const becameFullPlatoonIds = [...simulatedFullPlatoonIds]
    .filter((id) => !baselineFullPlatoonIds.has(id))
    .sort();

  const noLongerFullPlatoonIds = [...baselineFullPlatoonIds]
    .filter((id) => !simulatedFullPlatoonIds.has(id))
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

    baselineFullZones,
    simulatedFullZones,
    deltaFullZones: simulatedFullZones - baselineFullZones,

    changedAssignmentCount,
    displacedAssignmentCount,
    becameFullPlatoonIds,
    noLongerFullPlatoonIds,
  };
}

function cloneSlotForSimulation(slot: StrategicPlannerDataset['slots'][number]): StrategicPlannerDataset['slots'][number] {
  return { ...slot };
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

function findSlotByRequirementId(
  dataset: StrategicPlannerDataset,
  requirementId: string,
): DatasetSlot | undefined {
  return (dataset.slots as DatasetSlot[]).find((slot) => getSlotKey(slot) === requirementId);
}

function findRosterEntry(
  dataset: StrategicPlannerDataset,
  memberId: string,
  unitBaseId: string,
): StrategicPlannerDataset['roster'][number] | undefined {
  return dataset.roster.find((entry) => {
    const r = entry as unknown as AnyRecord;
    return (
      getString(r, 'memberId') === memberId &&
      getString(r, 'unitBaseId', 'baseId', 'defId') === unitBaseId
    );
  });
}

function ensureSyntheticMemberExists(
  dataset: StrategicPlannerDataset,
  memberId: string,
  playerName: string,
): void {
  const exists = dataset.members.some((member) => {
    const m = member as unknown as AnyRecord;
    return getString(m, 'memberId') === memberId;
  });

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

function applyUseOrUpgradeAction(
  dataset: StrategicPlannerDataset,
  action: Extract<PlatoonSimulatorAction, { type: 'USE_UNUSED_OWNER' | 'UPGRADE_OWNER_UNIT' }>,
): void {
  const rosterEntry = findRosterEntry(dataset, action.memberId, action.unitBaseId);
  const slot = findSlotByRequirementId(dataset, action.requirementId);

  if (!slot) {
    return;
  }

  if (!rosterEntry) {
    return;
  }

  const record = rosterEntry as unknown as Record<string, unknown>;

  const currentRarity = getNumber(record, 'rarity', 'currentRarity', 'starCount') ?? 0;
  const currentRelicTier = getNumber(record, 'relicTier', 'currentRelicTier') ?? 0;

  const nextRarity = Math.max(currentRarity, slot.requiredRarity ?? 0);
  const nextRelicTier = Math.max(currentRelicTier, slot.requiredRelicTier ?? 0);

  (rosterEntry as unknown as {
    rarity?: number;
    relicTier?: number;
    currentRarity?: number;
    currentRelicTier?: number;
    starCount?: number;
  }).rarity = nextRarity;

  (rosterEntry as unknown as {
    rarity?: number;
    relicTier?: number;
    currentRarity?: number;
    currentRelicTier?: number;
    starCount?: number;
  }).relicTier = nextRelicTier;

  if ('currentRarity' in (rosterEntry as object)) {
    (rosterEntry as unknown as { currentRarity?: number }).currentRarity = nextRarity;
  }

  if ('currentRelicTier' in (rosterEntry as object)) {
    (rosterEntry as unknown as { currentRelicTier?: number }).currentRelicTier = nextRelicTier;
  }

  if ('starCount' in (rosterEntry as object)) {
    (rosterEntry as unknown as { starCount?: number }).starCount = nextRarity;
  }
}
function applySingleAction(
  dataset: StrategicPlannerDataset,
  action: PlatoonSimulatorAction,
): void {
  switch (action.type) {
    case 'USE_UNUSED_OWNER':
    case 'UPGRADE_OWNER_UNIT': {
      applyUseOrUpgradeAction(dataset, action);
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

function getTargetPlatoonIdFromActions(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
): string | null {
  const requirementId =
    actions.find((action): action is Extract<PlatoonSimulatorAction, { requirementId: string }> =>
      'requirementId' in action && typeof action.requirementId === 'string',
    )?.requirementId ?? null;

  if (!requirementId) {
    return null;
  }

  const slot = findSlotByRequirementId(dataset, requirementId);
  if (!slot) {
    return null;
  }

  return getPlatoonIdFromSlot(slot);
}

export function applySimulationActions(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
): StrategicPlannerDataset {
  if (actions.length === 0) {
    return dataset;
  }

  const nextDataset = cloneDatasetForSimulation(dataset);

  for (const action of actions) {
    applySingleAction(nextDataset, action);
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
  const simulated = computePlatoonMatching(simulatedDataset);
  const delta = buildDelta(dataset, baseline, simulated);

  const coverageByPlatoon = getCoveredSlotsByPlatoon(simulated);
  const targetPlatoonId = getTargetPlatoonIdFromActions(simulatedDataset, actions);

  return {
    baseline,
    simulatedDataset,
    simulated,
    delta,
    steps: simulateStepEffects(simulatedDataset, actions),
    targetPlatoonId,
    simulatedCoverageByPlatoon: coverageByPlatoon,
  };
}