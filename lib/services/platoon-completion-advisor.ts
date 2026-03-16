import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import {
  applySimulationActions,
  simulatePlatoonScenario,
} from '@/lib/services/platoon-simulator';
import type {
  NextFullPlatoonResult,
  PlatoonSimulatorAction,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';
import type {
  PlanetCategory,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
  StrategicPlannerDataset,
} from '@/lib/types/platoon-readiness';

type SlotLike = StrategicPlannerDataset['slots'][number] & {
  slotKey?: string;
  requirementId?: string;
  unitBaseId: string;
  unitName?: string | null;
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
  planetCategory: PlanetCategory | null;
  requiredRarity: number | null;
  requiredRelicTier: number | null;
};

type RankedPlatoonCandidate = {
  targetPlatoonId: string;
  totalSlots: number;
  coveredSlots: number;
  missingSlots: number;
  actions: PlatoonSimulatorAction[];
  actionCost: number;
};

const MEMBER_CAP_PER_CATEGORY = 10;
const MAX_FINALISTS = 5;

function getPlatoonIdFromSlot(slot: {
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
}): string {
  return `${String(slot.phase)}::${slot.zoneKey}::${slot.platoonKey}`;
}

function getDatasetSlotKey(slot: StrategicPlannerDataset['slots'][number]): string | null {
  const s = slot as unknown as Record<string, unknown>;
  const candidates = [s.requirementId, s.slotKey, s.key];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function getCoveredSlotKeys(matching: PlatoonMatchingResult): Set<string> {
  const keys = new Set<string>();

  for (const assignment of matching.assignments) {
    const a = assignment as unknown as Record<string, unknown>;
    const requirementId =
      typeof a.requirementId === 'string'
        ? a.requirementId
        : typeof a.slotKey === 'string'
          ? a.slotKey
          : null;

    if (requirementId) {
      keys.add(requirementId);
    }
  }

  return keys;
}

function getTargetPlatoonCoverage(
  dataset: StrategicPlannerDataset,
  matching: PlatoonMatchingResult,
  targetPlatoonId: string,
): {
  totalSlots: number;
  coveredSlots: number;
  missingSlots: number;
  isFull: boolean;
} {
  const covered = getCoveredSlotKeys(matching);

  let totalSlots = 0;
  let coveredSlots = 0;

  for (const slot of dataset.slots as SlotLike[]) {
    if (getPlatoonIdFromSlot(slot) !== targetPlatoonId) continue;

    const slotKey = getDatasetSlotKey(slot);
    if (!slotKey) continue;

    totalSlots += 1;
    if (covered.has(slotKey)) {
      coveredSlots += 1;
    }
  }

  const missingSlots = totalSlots - coveredSlots;

  return {
    totalSlots,
    coveredSlots,
    missingSlots,
    isFull: totalSlots > 0 && missingSlots === 0,
  };
}

function getUncoveredSlotsForPlatoon(
  dataset: StrategicPlannerDataset,
  matching: PlatoonMatchingResult,
  targetPlatoonId: string,
): SlotLike[] {
  const covered = getCoveredSlotKeys(matching);

  return (dataset.slots as SlotLike[]).filter((slot) => {
    const slotKey = getDatasetSlotKey(slot);

    return (
      getPlatoonIdFromSlot(slot) === targetPlatoonId &&
      !!slotKey &&
      !covered.has(slotKey)
    );
  });
}

function buildGapIndex(
  matching: PlatoonMatchingResult,
): Map<string, PlatoonMatchingGap> {
  const map = new Map<string, PlatoonMatchingGap>();

  for (const gap of matching.gaps) {
    map.set(gap.requirementId, gap);
  }

  return map;
}

function makeOwnerUnitKey(memberId: string, unitBaseId: string): string {
  return `${memberId}\u001F${unitBaseId}`;
}

function makeMemberCategoryKey(
  phase: string | number,
  category: PlanetCategory | null,
  memberId: string,
): string {
  return `${String(phase)}\u001E${category ?? 'SPECIAL'}\u001E${memberId}`;
}

function getBaselineMemberCategoryLoad(
  baseline: PlatoonMatchingResult,
): Map<string, number> {
  const load = new Map<string, number>();

  for (const assignment of baseline.assignments) {
    const a = assignment as unknown as Record<string, unknown>;

    const phase =
      typeof a.phase === 'number'
        ? a.phase
        : typeof a.phase === 'string'
          ? a.phase
          : null;

    const planetCategory =
      typeof a.planetCategory === 'string'
        ? (a.planetCategory as PlanetCategory)
        : null;

    const memberId =
      typeof a.memberId === 'string'
        ? a.memberId
        : null;

    if (phase == null || !memberId) continue;

    const key = makeMemberCategoryKey(phase, planetCategory, memberId);
    load.set(key, (load.get(key) ?? 0) + 1);
  }

  return load;
}

function buildActionId(parts: string[]): string {
  return parts.join('::');
}

function actionCost(action: PlatoonSimulatorAction): number {
  switch (action.type) {
    case 'USE_UNUSED_OWNER':
      return 0;
    case 'UPGRADE_OWNER_UNIT':
      return action.missingRelicTiers * 100 + action.missingRarity * 10;
    case 'REMOVE_SOURCE_BLOCK':
      return 5;
    default:
      return 0;
  }
}

function buildRealClosurePlanForTargetPlatoon(
  dataset: StrategicPlannerDataset,
  baseline: PlatoonMatchingResult,
  targetPlatoonId: string,
): {
  actions: PlatoonSimulatorAction[];
  actionCost: number;
} | null {
  const uncoveredSlots = getUncoveredSlotsForPlatoon(dataset, baseline, targetPlatoonId);
  if (uncoveredSlots.length === 0) {
    return null;
  }

  const gapByRequirementId = buildGapIndex(baseline);
  const baselineLoad = getBaselineMemberCategoryLoad(baseline);
  const workingLoad = new Map(baselineLoad);
  const usedOwnerUnits = new Set<string>();

  const slotsWithGaps = uncoveredSlots
    .map((slot) => {
      const requirementId = getDatasetSlotKey(slot);
      const gap = requirementId ? gapByRequirementId.get(requirementId) ?? null : null;

      return {
        slot,
        requirementId,
        gap,
      };
    })
    .filter((entry) => entry.requirementId && entry.gap)
    .sort((a, b) => {
      const aSources = a.gap?.possibleSources.length ?? 0;
      const bSources = b.gap?.possibleSources.length ?? 0;

      if (aSources !== bSources) {
        return aSources - bSources;
      }

      return (a.requirementId ?? '').localeCompare(b.requirementId ?? '');
    });

  if (slotsWithGaps.length !== uncoveredSlots.length) {
    return null;
  }

  const actions: PlatoonSimulatorAction[] = [];

  for (const entry of slotsWithGaps) {
    const slot = entry.slot;
    const gap = entry.gap!;
    const requirementId = entry.requirementId!;

    let chosen: PlatoonSimulatorAction | null = null;

    for (const source of gap.possibleSources) {
      const ownerUnitKey = makeOwnerUnitKey(source.memberId, slot.unitBaseId);
      if (usedOwnerUnits.has(ownerUnitKey)) {
        continue;
      }

      const memberCategoryKey = makeMemberCategoryKey(
        slot.phase,
        slot.planetCategory,
        source.memberId,
      );

      const currentLoad = workingLoad.get(memberCategoryKey) ?? 0;
      if (currentLoad >= MEMBER_CAP_PER_CATEGORY) {
        continue;
      }

      if (gap.recommendedAction === 'use_unused' && source.kind === 'eligible') {
        chosen = {
          id: buildActionId([
            'use_unused_owner',
            requirementId,
            source.memberId,
            slot.unitBaseId,
          ]),
          type: 'USE_UNUSED_OWNER',
          requirementId,
          memberId: source.memberId,
          playerName: source.playerName,
          unitBaseId: slot.unitBaseId,
          unitName: slot.unitName ?? gap.unitName ?? slot.unitBaseId,
        };
        break;
      }

      if (source.kind === 'near_miss') {
        chosen = {
          id: buildActionId([
            'upgrade_owner_unit',
            requirementId,
            source.memberId,
            slot.unitBaseId,
          ]),
          type: 'UPGRADE_OWNER_UNIT',
          requirementId,
          memberId: source.memberId,
          playerName: source.playerName,
          unitBaseId: slot.unitBaseId,
          unitName: slot.unitName ?? gap.unitName ?? slot.unitBaseId,
          missingRelicTiers: source.missingRelicTiers,
          missingRarity: source.missingRarity,
        };
        break;
      }
    }

    if (!chosen) {
      return null;
    }

    actions.push(chosen);

    const ownerUnitKey = makeOwnerUnitKey(chosen.memberId, chosen.unitBaseId);
    usedOwnerUnits.add(ownerUnitKey);

    const memberCategoryKey = makeMemberCategoryKey(
      slot.phase,
      slot.planetCategory,
      chosen.memberId,
    );
    workingLoad.set(memberCategoryKey, (workingLoad.get(memberCategoryKey) ?? 0) + 1);
  }

  return {
    actions,
    actionCost: actions.reduce((sum, action) => sum + actionCost(action), 0),
  };
}

function rankPlatoonsForRealClosure(
  dataset: StrategicPlannerDataset,
  baseline: PlatoonMatchingResult,
): RankedPlatoonCandidate[] {
  const platoonIds = Array.from(
    new Set((dataset.slots as SlotLike[]).map((slot) => getPlatoonIdFromSlot(slot))),
  );

  const ranked: RankedPlatoonCandidate[] = [];

  for (const targetPlatoonId of platoonIds) {
    const coverage = getTargetPlatoonCoverage(dataset, baseline, targetPlatoonId);

    if (coverage.totalSlots === 0) continue;
    if (coverage.isFull) continue;
    if (coverage.missingSlots <= 0) continue;

    const plan = buildRealClosurePlanForTargetPlatoon(dataset, baseline, targetPlatoonId);
    if (!plan) continue;

    ranked.push({
      targetPlatoonId,
      totalSlots: coverage.totalSlots,
      coveredSlots: coverage.coveredSlots,
      missingSlots: coverage.missingSlots,
      actions: plan.actions,
      actionCost: plan.actionCost,
    });
  }

    ranked.sort((a, b) => {
      if (a.missingSlots !== b.missingSlots) {
        return a.missingSlots - b.missingSlots;
      }

      if (a.actionCost !== b.actionCost) {
        return a.actionCost - b.actionCost;
      }

      if (a.coveredSlots !== b.coveredSlots) {
        return b.coveredSlots - a.coveredSlots;
      }

      if (a.actions.length !== b.actions.length) {
        return a.actions.length - b.actions.length;
      }

      return a.targetPlatoonId.localeCompare(b.targetPlatoonId);
    });

  return ranked;
}

function compareCandidateScore(
  a: NextFullPlatoonResult,
  b: NextFullPlatoonResult,
): number {
  if (a.targetBecomesFull !== b.targetBecomesFull) {
    return a.targetBecomesFull ? 1 : -1;
  }

  if (a.deltaFullPlatoons !== b.deltaFullPlatoons) {
    return a.deltaFullPlatoons - b.deltaFullPlatoons;
  }

  if (a.deltaCoveredSlots !== b.deltaCoveredSlots) {
    return a.deltaCoveredSlots - b.deltaCoveredSlots;
  }

  if ((a.actionCost ?? 0) !== (b.actionCost ?? 0)) {
    return (b.actionCost ?? 0) - (a.actionCost ?? 0);
  }

  if ((a.displacedAssignmentCount ?? 0) !== (b.displacedAssignmentCount ?? 0)) {
    return (b.displacedAssignmentCount ?? 0) - (a.displacedAssignmentCount ?? 0);
  }

  if ((a.changedAssignmentCount ?? 0) !== (b.changedAssignmentCount ?? 0)) {
    return (b.changedAssignmentCount ?? 0) - (a.changedAssignmentCount ?? 0);
  }

  if (a.targetMissingSlotsAfter !== b.targetMissingSlotsAfter) {
    return b.targetMissingSlotsAfter - a.targetMissingSlotsAfter;
  }

  if (a.actions.length !== b.actions.length) {
    return b.actions.length - a.actions.length;
  }

  return b.targetPlatoonId.localeCompare(a.targetPlatoonId);
}
function findBestNextFullPlatoonCandidate(
  dataset: StrategicPlannerDataset,
  baseline: PlatoonMatchingResult,
): NextFullPlatoonResult | null {
  const rankedAll = rankPlatoonsForRealClosure(dataset, baseline);
  const ranked = rankedAll.slice(0, MAX_FINALISTS);

  let best: NextFullPlatoonResult | null = null;

  for (const finalist of ranked) {
    const before = getTargetPlatoonCoverage(
      dataset,
      baseline,
      finalist.targetPlatoonId,
    );

    const simulation = simulatePlatoonScenario(
      dataset,
      finalist.actions,
      baseline,
    );

    const after = getTargetPlatoonCoverage(
      simulation.simulatedDataset,
      simulation.simulated,
      finalist.targetPlatoonId,
    );

    const candidate: NextFullPlatoonResult = {
      targetPlatoonId: finalist.targetPlatoonId,
      actions: finalist.actions,
      deltaCoveredSlots: simulation.delta.deltaCoveredSlots,
      deltaFullPlatoons: simulation.delta.deltaFullPlatoons,
      actionCost: finalist.actionCost,
      changedAssignmentCount: simulation.delta.changedAssignmentCount,
      displacedAssignmentCount: simulation.delta.displacedAssignmentCount,
      becameFullPlatoonIds: simulation.delta.becameFullPlatoonIds,
      noLongerFullPlatoonIds: simulation.delta.noLongerFullPlatoonIds,
      targetCoveredSlotsBefore: before.coveredSlots,
      targetCoveredSlotsAfter: after.coveredSlots,
      targetMissingSlotsBefore: before.missingSlots,
      targetMissingSlotsAfter: after.missingSlots,
      targetBecomesFull: !before.isFull && after.isFull,
    };

    const hasUsefulProgress =
      candidate.targetBecomesFull ||
      candidate.deltaFullPlatoons > 0 ||
      candidate.deltaCoveredSlots > 0 ||
      candidate.targetCoveredSlotsAfter > candidate.targetCoveredSlotsBefore;

    if (!hasUsefulProgress) {
      continue;
    }

    if (!best || compareCandidateScore(candidate, best) > 0) {
      best = candidate;
    }
  }

  return best;
}

export function findSequentialFullPlatoonPlan(
  dataset: StrategicPlannerDataset,
  precomputedBaseline?: PlatoonMatchingResult,
): SequentialFullPlatoonPlan {
  const baseline = precomputedBaseline ?? computePlatoonMatching(dataset);

  const first = findBestNextFullPlatoonCandidate(dataset, baseline);

  if (!first) {
    return {
      first: null,
      second: null,
    };
  }

  const datasetAfterFirst = applySimulationActions(dataset, first.actions);
  const baselineAfterFirst = computePlatoonMatching(datasetAfterFirst);

  const second = findBestNextFullPlatoonCandidate(
    datasetAfterFirst,
    baselineAfterFirst,
  );

  return {
    first,
    second,
  };
}