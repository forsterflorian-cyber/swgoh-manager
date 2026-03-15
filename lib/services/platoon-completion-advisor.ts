import {
  applySimulationActions,
  simulatePlatoonScenario,
} from '@/lib/services/platoon-simulator';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';

import type {
  NextFullPlatoonResult,
  PlatoonSimulatorAction,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';
import type {
  PlatoonMatchingAssignment,
  PlatoonMatchingResult,
  StrategicPlannerDataset,
} from '@/lib/types/platoon-readiness';

type SlotLike = StrategicPlannerDataset['slots'][number] & {
  slotKey?: string;
  requirementId?: string;
  unitBaseId: string;
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
  requiredRarity: number | null;
  requiredRelicTier: number | null;
};

type RankedPlatoonCandidate = {
  targetPlatoonId: string;
  totalSlots: number;
  coveredSlots: number;
  missingSlots: number;
  actions: PlatoonSimulatorAction[];
  directFillScore: number;
};

const MAX_FINALISTS = 5;

function getPlatoonIdFromSlot(slot: {
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
}): string {
  return `${String(slot.phase)}::${slot.zoneKey}::${slot.platoonKey}`;
}

function getAssignmentSlotKey(assignment: PlatoonMatchingAssignment): string | null {
  const a = assignment as unknown as Record<string, unknown>;

  const directCandidates = [
    a.requirementId,
    a.slotKey,
    a.targetSlotKey,
    a.requiredSlotKey,
    a.key,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  const nestedObjects = [a.slot, a.targetSlot, a.requiredSlot, a.target];

  for (const obj of nestedObjects) {
    if (!obj || typeof obj !== 'object') continue;

    const r = obj as Record<string, unknown>;
    const nestedCandidates = [
      r.requirementId,
      r.slotKey,
      r.targetSlotKey,
      r.requiredSlotKey,
      r.key,
    ];

    for (const candidate of nestedCandidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
  }

  return null;
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
    const slotKey = getAssignmentSlotKey(assignment);
    if (slotKey) {
      keys.add(slotKey);
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

function buildActionsForTargetPlatoon(
  dataset: StrategicPlannerDataset,
  baseline: PlatoonMatchingResult,
  targetPlatoonId: string,
): PlatoonSimulatorAction[] {
  const missingSlots = getUncoveredSlotsForPlatoon(dataset, baseline, targetPlatoonId);
  const safeTargetId = sanitizeSyntheticIdPart(targetPlatoonId);

  return missingSlots.map((slot, index) => ({
    type: 'ADD_HYPOTHETICAL_UNIT' as const,
    memberId: `sim_member_${safeTargetId}_${index + 1}`,
    unitBaseId: slot.unitBaseId,
    rarity: slot.requiredRarity ?? 0,
    relicTier: slot.requiredRelicTier ?? 0,
  }));
}

function compareCandidateScore(
  a: NextFullPlatoonResult,
  b: NextFullPlatoonResult,
): number {
  if (a.targetBecomesFull !== b.targetBecomesFull) {
    return a.targetBecomesFull ? 1 : -1;
  }

  const aTargetGain = a.targetCoveredSlotsAfter - a.targetCoveredSlotsBefore;
  const bTargetGain = b.targetCoveredSlotsAfter - b.targetCoveredSlotsBefore;

  if (aTargetGain !== bTargetGain) {
    return aTargetGain - bTargetGain;
  }

  if (a.deltaFullPlatoons !== b.deltaFullPlatoons) {
    return a.deltaFullPlatoons - b.deltaFullPlatoons;
  }

  if (a.deltaCoveredSlots !== b.deltaCoveredSlots) {
    return a.deltaCoveredSlots - b.deltaCoveredSlots;
  }

  if ((a.displacedAssignmentCount ?? 0) !== (b.displacedAssignmentCount ?? 0)) {
    return (b.displacedAssignmentCount ?? 0) - (a.displacedAssignmentCount ?? 0);
  }

  if ((a.changedAssignmentCount ?? 0) !== (b.changedAssignmentCount ?? 0)) {
    return (a.changedAssignmentCount ?? 0) - (b.changedAssignmentCount ?? 0);
  }

  if (a.actions.length !== b.actions.length) {
    return b.actions.length - a.actions.length;
  }

  return 0;
}

function rankPlatoonsForSimulation(
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

    const actions = buildActionsForTargetPlatoon(dataset, baseline, targetPlatoonId);
    if (actions.length === 0) continue;

    let directFillScore = 0;

    for (const action of actions) {
      if (action.type !== 'ADD_HYPOTHETICAL_UNIT') continue;

      directFillScore += 1;

      if (action.relicTier > 0) {
        directFillScore += 0.25;
      }

      if (action.rarity >= 7) {
        directFillScore += 0.1;
      }
    }

    ranked.push({
      targetPlatoonId,
      totalSlots: coverage.totalSlots,
      coveredSlots: coverage.coveredSlots,
      missingSlots: coverage.missingSlots,
      actions,
      directFillScore,
    });
  }

  ranked.sort((a, b) => {
    if (a.missingSlots !== b.missingSlots) {
      return a.missingSlots - b.missingSlots;
    }

    if (a.coveredSlots !== b.coveredSlots) {
      return b.coveredSlots - a.coveredSlots;
    }

    if (a.directFillScore !== b.directFillScore) {
      return b.directFillScore - a.directFillScore;
    }

    if (a.actions.length !== b.actions.length) {
      return a.actions.length - b.actions.length;
    }

    return a.targetPlatoonId.localeCompare(b.targetPlatoonId);
  });

  return ranked;
}

function findBestNextFullPlatoonCandidate(
  dataset: StrategicPlannerDataset,
  baseline: PlatoonMatchingResult,
): NextFullPlatoonResult | null {
  const rankedAll = rankPlatoonsForSimulation(dataset, baseline);
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
      changedAssignmentCount: simulation.delta.changedAssignmentCount,
      displacedAssignmentCount: simulation.delta.displacedAssignmentCount,
      targetCoveredSlotsBefore: before.coveredSlots,
      targetCoveredSlotsAfter: after.coveredSlots,
      targetMissingSlotsBefore: before.missingSlots,
      targetMissingSlotsAfter: after.missingSlots,
      targetBecomesFull: !before.isFull && after.isFull,
    };

    const hasUsefulProgress =
      candidate.targetCoveredSlotsAfter > candidate.targetCoveredSlotsBefore ||
      candidate.targetBecomesFull ||
      candidate.deltaCoveredSlots > 0 ||
      candidate.deltaFullPlatoons > 0;

    if (!hasUsefulProgress) {
      continue;
    }

    if (!best || compareCandidateScore(candidate, best) > 0) {
      best = candidate;
    }
  }

  return best;
}
function sanitizeSyntheticIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
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