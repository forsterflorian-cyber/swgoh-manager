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

type GapCandidateAction = {
  gap: PlatoonMatchingGap;
  platoonId: string;
  action: PlatoonSimulatorAction;
};

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

function getGapId(gap: PlatoonMatchingGap): string {
  return [
    gap.phase,
    gap.zoneKey,
    gap.platoonKey,
    gap.slotNumber,
    gap.unitBaseId,
  ].join('::');
}

function getPlatoonIdForGap(gap: PlatoonMatchingGap): string {
  return [gap.phase, gap.zoneKey, gap.platoonKey].join('::');
}

function buildMakeSlotEligibleAction(
  slot: StrategicPlannerSlotInput,
  source: GapPossibleSource,
): PlatoonSimulatorAction {
  return {
    id: `eligible-${slot.slotKey}-${source.memberId}`,
    type: 'MAKE_SLOT_ELIGIBLE',
    slotKey: slot.slotKey,
    memberId: source.memberId,
    reason: source.kind === 'eligible' ? 'availability' : 'upgrade',
  };
}

function getCandidateActionsForGap(
  dataset: StrategicPlannerDataset,
  gap: PlatoonMatchingGap,
): GapCandidateAction[] {
  const slot = findDatasetSlotForGap(dataset, gap);
  if (!slot) return [];

  const platoonId = getPlatoonIdForGap(gap);
  const result: GapCandidateAction[] = [];

  for (const source of gap.possibleSources.slice(0, 3)) {
    result.push({
      gap,
      platoonId,
      action: buildMakeSlotEligibleAction(slot, source),
    });
  }

  return result;
}

function getActionIdentity(action: PlatoonSimulatorAction): string {
  if (action.type === 'MAKE_SLOT_ELIGIBLE') {
    return `${action.type}::${action.slotKey}::${action.memberId}`;
  }

  return action.id;
}

function dedupeActions(
  actions: PlatoonSimulatorAction[],
): PlatoonSimulatorAction[] {
  const seen = new Set<string>();
  const result: PlatoonSimulatorAction[] = [];

  for (const action of actions) {
    const key = getActionIdentity(action);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }

  return result;
}

function getAllGapCandidateActions(
  dataset: StrategicPlannerDataset,
  matching: PlatoonMatchingResult,
): GapCandidateAction[] {
  const result: GapCandidateAction[] = [];

  for (const gap of matching.gaps) {
    result.push(...getCandidateActionsForGap(dataset, gap));
  }

  return result;
}

function scoreCandidate(
  candidate: NextFullPlatoonResult,
  best: NextFullPlatoonResult | null,
): boolean {
  if (!best) return true;

  if (candidate.deltaFullPlatoons !== best.deltaFullPlatoons) {
    return candidate.deltaFullPlatoons > best.deltaFullPlatoons;
  }

  if (candidate.deltaCoveredSlots !== best.deltaCoveredSlots) {
    return candidate.deltaCoveredSlots > best.deltaCoveredSlots;
  }

  if (candidate.changedAssignmentCount !== best.changedAssignmentCount) {
    return candidate.changedAssignmentCount < best.changedAssignmentCount;
  }

  if (candidate.displacedAssignmentCount !== best.displacedAssignmentCount) {
    return candidate.displacedAssignmentCount < best.displacedAssignmentCount;
  }

  return candidate.actions.length < best.actions.length;
}

function evaluateActionSet(
  dataset: StrategicPlannerDataset,
  actions: PlatoonSimulatorAction[],
): NextFullPlatoonResult | null {
  const dedupedActions = dedupeActions(actions);
  if (dedupedActions.length === 0) return null;

  const result = simulatePlatoonScenario(dataset, dedupedActions);

  if (result.delta.deltaFullPlatoons < 1) return null;

  const targetPlatoonId = result.delta.becameFullPlatoonIds[0];
  if (!targetPlatoonId) return null;

  return {
    targetPlatoonId,
    actions: dedupedActions,
    deltaFullPlatoons: result.delta.deltaFullPlatoons,
    deltaCoveredSlots: result.delta.deltaCoveredSlots,
    changedAssignmentCount: result.delta.changedAssignmentCount,
    displacedAssignmentCount: result.delta.displacedAssignmentCount,
  };
}

export function findNextFullPlatoon(
  dataset: StrategicPlannerDataset,
  matching: PlatoonMatchingResult,
): NextFullPlatoonResult | null {
  const allCandidates = getAllGapCandidateActions(dataset, matching);

  let best: NextFullPlatoonResult | null = null;

  for (const single of allCandidates) {
    const candidate = evaluateActionSet(dataset, [single.action]);
    if (candidate && scoreCandidate(candidate, best)) {
      best = candidate;
    }
  }

  if (best) return best;

  const gapsByPlatoon = new Map<string, PlatoonMatchingGap[]>();

  for (const gap of matching.gaps) {
    const platoonId = getPlatoonIdForGap(gap);
    const existing = gapsByPlatoon.get(platoonId);
    if (existing) {
      existing.push(gap);
    } else {
      gapsByPlatoon.set(platoonId, [gap]);
    }
  }

  const prioritizedPlatoons = Array.from(gapsByPlatoon.entries())
    .sort((a, b) => a[1].length - b[1].length)
    .slice(0, 8);

  for (const [platoonId, gaps] of prioritizedPlatoons) {
    const relevantGaps = gaps.slice(0, 3);
    const platoonGapIds = new Set(relevantGaps.map(getGapId));

    const platoonCandidates = allCandidates.filter((candidate) => {
      return (
        candidate.platoonId === platoonId &&
        platoonGapIds.has(getGapId(candidate.gap))
      );
    });

    for (let i = 0; i < platoonCandidates.length; i++) {
      for (let j = i + 1; j < platoonCandidates.length; j++) {
        const left = platoonCandidates[i];
        const right = platoonCandidates[j];
        if (!left || !right) continue;

        if (getGapId(left.gap) === getGapId(right.gap)) continue;

        if (left.action.memberId === right.action.memberId) continue;

        const candidate = evaluateActionSet(dataset, [
          left.action,
          right.action,
        ]);

        if (candidate && scoreCandidate(candidate, best)) {
          best = candidate;
        }
      }
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