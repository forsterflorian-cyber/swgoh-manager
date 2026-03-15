import type {
  NextFullPlatoonResult,
  PlatoonSimulatorAction,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';
import type {
  GapPossibleSource,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
} from '@/lib/types/platoon-readiness';
import {
  applySimulationActions,
  simulatePlatoonScenario,
} from '@/lib/services/platoon-simulator';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';

type StrategicPlannerData = any;

function readGapSlotId(gap: PlatoonMatchingGap): string | null {
  const candidate = gap as unknown as Record<string, unknown>;

  const possibleKeys = [
    'slotId',
    'platoonSlotId',
    'targetSlotId',
    'requirementId',
    'id',
  ];

  for (const key of possibleKeys) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function readPossibleSourceOwnerKey(source: GapPossibleSource): string | null {
  const candidate = source as unknown as Record<string, unknown>;

  const possibleKeys = [
    'ownerKey',
    'sourceOwnerKey',
    'unitOwnerKey',
    'memberKey',
    'playerKey',
    'rosterUnitId',
    'unitId',
    'id',
  ];

  for (const key of possibleKeys) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function getTopGapBasedActions(
  matching: PlatoonMatchingResult,
): PlatoonSimulatorAction[] {
  const actions: PlatoonSimulatorAction[] = [];

  for (const gap of matching.gaps.slice(0, 10)) {
    const slotId = readGapSlotId(gap);
    if (!slotId) continue;

    const topSources = gap.possibleSources?.slice(0, 2) ?? [];

    for (const source of topSources) {
      const ownerKey = readPossibleSourceOwnerKey(source);
      if (!ownerKey) continue;

      actions.push({
        id: `eligible-${slotId}-${ownerKey}`,
        type: 'MAKE_SLOT_ELIGIBLE',
        slotId,
        ownerKey,
        reason: 'upgrade',
      });
    }
  }

  return actions;
}

export function findNextFullPlatoon(
  dataset: StrategicPlannerData,
  matching: PlatoonMatchingResult,
): NextFullPlatoonResult | null {
  const candidateActions = getTopGapBasedActions(matching);

  let best: NextFullPlatoonResult | null = null;

  for (const action of candidateActions) {
    const result = simulatePlatoonScenario(dataset, [action]);

    if (result.delta.deltaFullPlatoons < 1) continue;

    const targetPlatoonId = result.delta.becameFullPlatoonIds[0];
    if (!targetPlatoonId) continue;

    const candidate: NextFullPlatoonResult = {
      targetPlatoonId,
      actions: [action],
      deltaFullPlatoons: result.delta.deltaFullPlatoons,
      deltaCoveredSlots: result.delta.deltaCoveredSlots,
      changedAssignmentCount: result.delta.changedAssignmentCount,
      displacedAssignmentCount: result.delta.displacedAssignmentCount,
    };

    if (!best) {
      best = candidate;
      continue;
    }

    const isBetter =
      candidate.deltaFullPlatoons > best.deltaFullPlatoons ||
      (candidate.deltaFullPlatoons === best.deltaFullPlatoons &&
        candidate.deltaCoveredSlots > best.deltaCoveredSlots) ||
      (candidate.deltaFullPlatoons === best.deltaFullPlatoons &&
        candidate.deltaCoveredSlots === best.deltaCoveredSlots &&
        candidate.changedAssignmentCount < best.changedAssignmentCount);

    if (isBetter) best = candidate;
  }

  return best;
}

export function findSequentialFullPlatoonPlan(
  dataset: StrategicPlannerData,
): SequentialFullPlatoonPlan {
  const baselineMatching = computePlatoonMatching(dataset);

  const first = findNextFullPlatoon(dataset, baselineMatching);

  if (!first) {
    return {
      first: null,
      second: null,
    };
  }

  const datasetAfterFirst = applySimulationActions(dataset, first.actions);
  const matchingAfterFirst = computePlatoonMatching(datasetAfterFirst);

  const second = findNextFullPlatoon(datasetAfterFirst, matchingAfterFirst);

  return {
    first,
    second,
  };
}