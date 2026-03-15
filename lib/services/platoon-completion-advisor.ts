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
  slotKey: string;
  unitBaseId: string;
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
  requiredRarity: number | null;
  requiredRelicTier: number | null;
};

function getPlatoonIdFromSlot(slot: {
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
}): string {
  return `${String(slot.phase)}::${slot.zoneKey}::${slot.platoonKey}`;
}

function getCoveredSlotKeys(
  matching: PlatoonMatchingResult,
): Set<string> {
  const keys = new Set<string>();

  for (const assignment of matching.assignments) {
    const assignmentWithDirectSlotKey = assignment as PlatoonMatchingAssignment & {
      slotKey?: string;
    };

    const assignmentWithNestedSlot = assignment as PlatoonMatchingAssignment & {
      slot?: { slotKey?: string | null } | null;
    };

    const slotKey =
      typeof assignmentWithDirectSlotKey.slotKey === 'string'
        ? assignmentWithDirectSlotKey.slotKey
        : typeof assignmentWithNestedSlot.slot?.slotKey === 'string'
          ? assignmentWithNestedSlot.slot.slotKey
          : null;

    if (slotKey) {
      keys.add(slotKey);
    }
  }

  return keys;
}

function getTargetPlatoonCoverage(
  dataset: {
    slots: Array<{
      slotKey: string;
      phase: string | number;
      zoneKey: string;
      platoonKey: string;
    }>;
  },
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

  for (const slot of dataset.slots) {
    if (getPlatoonIdFromSlot(slot) !== targetPlatoonId) continue;

    totalSlots += 1;

    if (covered.has(slot.slotKey)) {
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
  dataset: {
    slots: Array<{
      slotKey: string;
      unitBaseId: string;
      phase: string | number;
      zoneKey: string;
      platoonKey: string;
      requiredRarity: number | null;
      requiredRelicTier: number | null;
    }>;
  },
  matching: PlatoonMatchingResult,
  targetPlatoonId: string,
) {
  const covered = getCoveredSlotKeys(matching);

  return dataset.slots.filter((slot) => {
    return (
      getPlatoonIdFromSlot(slot) === targetPlatoonId &&
      !covered.has(slot.slotKey)
    );
  });
}

function buildActionsForTargetPlatoon(
  dataset: StrategicPlannerDataset,
  baseline: PlatoonMatchingResult,
  targetPlatoonId: string,
): PlatoonSimulatorAction[] {
  const missingSlots = getUncoveredSlotsForPlatoon(
    dataset as {
      slots: Array<{
        slotKey: string;
        unitBaseId: string;
        phase: string | number;
        zoneKey: string;
        platoonKey: string;
        requiredRarity: number | null;
        requiredRelicTier: number | null;
      }>;
    },
    baseline,
    targetPlatoonId,
  );

  return missingSlots.map((slot, index) => ({
    type: 'ADD_HYPOTHETICAL_UNIT' as const,
    memberId: `hypothetical-member-${targetPlatoonId}-${index + 1}`,
    unitBaseId: slot.unitBaseId,
    rarity: slot.requiredRarity ?? 0,
    relicTier: slot.requiredRelicTier ?? 0,
  }));
}

function getSimulationDelta(simulation: ReturnType<typeof simulatePlatoonScenario>): {
  deltaCoveredSlots: number;
  deltaFullPlatoons: number;
} {
  const deltaRecord = simulation.delta as {
    coveredSlots?: number;
    fullPlatoons?: number;
    deltaCoveredSlots?: number;
    deltaFullPlatoons?: number;
  };

  return {
    deltaCoveredSlots:
      deltaRecord.deltaCoveredSlots ?? deltaRecord.coveredSlots ?? 0,
    deltaFullPlatoons:
      deltaRecord.deltaFullPlatoons ?? deltaRecord.fullPlatoons ?? 0,
  };
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

  if (a.actions.length !== b.actions.length) {
    return b.actions.length - a.actions.length;
  }

  return 0;
}

function findBestNextFullPlatoonCandidate(
  dataset: StrategicPlannerDataset,
  baseline: PlatoonMatchingResult,
): NextFullPlatoonResult | null {
  const platoonIds = Array.from(
    new Set(
      (dataset.slots as SlotLike[]).map((slot) => getPlatoonIdFromSlot(slot)),
    ),
  );

  let best: NextFullPlatoonResult | null = null;

  for (const targetPlatoonId of platoonIds) {
    const before = getTargetPlatoonCoverage(
      dataset as {
        slots: Array<{
          slotKey: string;
          phase: string | number;
          zoneKey: string;
          platoonKey: string;
        }>;
      },
      baseline,
      targetPlatoonId,
    );

    if (before.totalSlots === 0) continue;
    if (before.isFull) continue;
    if (before.missingSlots <= 0) continue;

    const actions = buildActionsForTargetPlatoon(dataset, baseline, targetPlatoonId);
    if (actions.length === 0) continue;

    const simulation = simulatePlatoonScenario(dataset, actions, baseline);
    const delta = getSimulationDelta(simulation);

    const after = getTargetPlatoonCoverage(
      simulation.simulatedDataset as {
        slots: Array<{
          slotKey: string;
          phase: string | number;
          zoneKey: string;
          platoonKey: string;
        }>;
      },
      simulation.simulated,
      targetPlatoonId,
    );

    const candidate: NextFullPlatoonResult = {
      targetPlatoonId,
      actions,
      deltaCoveredSlots: delta.deltaCoveredSlots,
      deltaFullPlatoons: delta.deltaFullPlatoons,
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

export function findSequentialFullPlatoonPlan(
  dataset: StrategicPlannerDataset,
): SequentialFullPlatoonPlan {
  const baseline = computePlatoonMatching(dataset);

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