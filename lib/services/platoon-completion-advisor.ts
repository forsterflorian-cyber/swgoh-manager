import type {
  GapPossibleSource,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
  StrategicPlannerDataset,
  StrategicPlannerSlotInput,
} from '@/lib/types/platoon-readiness';
import type {
  NextFullPlatoonResult,
  PlatoonSimulatorAction,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';
import {
  applySimulationActions,
  simulatePlatoonScenario,
} from '@/lib/services/platoon-simulator';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';

function findDatasetSlotForGap(
  dataset: StrategicPlannerDataset,
  gap: PlatoonMatchingGap,
): StrategicPlannerSlotInput | null {
  return (
    dataset.slots.find(
      (slot) =>
        slot.phase === gap.phase &&
        slot.zoneKey === gap.zoneKey &&
        slot.platoonKey === gap.platoonKey &&
        slot.slotNumber === gap.slotNumber &&
        slot.unitBaseId === gap.unitBaseId,
    ) ?? null
  );
}

function getTopGapBasedActions(
  dataset: StrategicPlannerDataset,
  matching: PlatoonMatchingResult,
): PlatoonSimulatorAction[] {
  const actions: PlatoonSimulatorAction[] = [];

  for (const gap of matching.gaps.slice(0, 10)) {
    const slot = findDatasetSlotForGap(dataset, gap);
    if (!slot) continue;

    const topSources: GapPossibleSource[] = gap.possibleSources.slice(0, 2);

    for (const source of topSources) {
      actions.push({
        id: `eligible-${slot.slotKey}-${source.memberId}`,
        type: 'MAKE_SLOT_ELIGIBLE',
        slotKey: slot.slotKey,
        memberId: source.memberId,
        reason: source.kind === 'eligible' ? 'availability' : 'upgrade',
      });
    }
  }

  return actions;
}

export function findNextFullPlatoon(
  dataset: StrategicPlannerDataset,
  matching: PlatoonMatchingResult,
): NextFullPlatoonResult | null {
  const candidateActions = getTopGapBasedActions(dataset, matching);

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

    const isBetter =
      !best ||
      candidate.deltaFullPlatoons > best.deltaFullPlatoons ||
      (candidate.deltaFullPlatoons === best.deltaFullPlatoons &&
        candidate.deltaCoveredSlots > best.deltaCoveredSlots) ||
      (candidate.deltaFullPlatoons === best.deltaFullPlatoons &&
        candidate.deltaCoveredSlots === best.deltaCoveredSlots &&
        candidate.changedAssignmentCount < best.changedAssignmentCount);

    if (isBetter) {
      best = candidate;
    }
  }

  return best;
}

export function findSequentialFullPlatoonPlan(
  dataset: StrategicPlannerDataset,
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