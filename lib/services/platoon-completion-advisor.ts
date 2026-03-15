import type {
  NextFullPlatoonResult,
  PlatoonSimulatorAction,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';
import type { PlatoonMatchingResult } from '@/lib/types/platoon-readiness';
import { applySimulationActions, simulatePlatoonScenario } from '@/lib/services/platoon-simulator';

// TODO: an dein Projekt anpassen
import { computePlatoonMatching } from '@/lib/services/platoon-matching';

type StrategicPlannerData = any;

function getTopGapBasedActions(
  matching: PlatoonMatchingResult,
): PlatoonSimulatorAction[] {
  const actions: PlatoonSimulatorAction[] = [];

  for (const gap of matching.gaps.slice(0, 10)) {
    const topSources = gap.possibleSources?.slice(0, 2) ?? [];

    for (const source of topSources) {
      if (source.actionType === 'REMOVE_BLOCK' && source.ownerKey) {
        actions.push({
          id: `remove-block-${gap.slotId}-${source.ownerKey}`,
          type: 'REMOVE_SOURCE_BLOCK',
          ownerKey: source.ownerKey,
          blockType: 'committed',
        });
      }

      if (source.ownerKey) {
        actions.push({
          id: `eligible-${gap.slotId}-${source.ownerKey}`,
          type: 'MAKE_SLOT_ELIGIBLE',
          slotId: gap.slotId,
          ownerKey: source.ownerKey,
          reason: 'upgrade',
        });
      }
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