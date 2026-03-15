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

type PlatoonGapGroup = {
  platoonId: string;
  gaps: PlatoonMatchingGap[];
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

function getPlatoonIdForGap(gap: PlatoonMatchingGap): string {
  return [gap.phase, gap.zoneKey, gap.platoonKey].join('::');
}

function buildActionForGapSource(
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

function getActionIdentity(action: PlatoonSimulatorAction): string {
  if (action.type === 'MAKE_SLOT_ELIGIBLE') {
    return `${action.type}::${action.slotKey}::${action.memberId}`;
  }

  return `${action.type}::${action.memberId}::${action.unitBaseId}::${action.planetCategory ?? 'null'}::${action.blockType}`;
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

function scoreCandidate(
  candidate: NextFullPlatoonResult,
  best: NextFullPlatoonResult | null,
): boolean {
  if (!best) return true;

  const candidateActionCount = candidate.actions.length;
  const bestActionCount = best.actions.length;

  if (candidateActionCount !== bestActionCount) {
    return candidateActionCount < bestActionCount;
  }

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

  return candidate.targetPlatoonId < best.targetPlatoonId;
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

function groupGapsByPlatoon(
  matching: PlatoonMatchingResult,
): PlatoonGapGroup[] {
  const map = new Map<string, PlatoonMatchingGap[]>();

  for (const gap of matching.gaps) {
    const platoonId = getPlatoonIdForGap(gap);
    const list = map.get(platoonId);

    if (list) {
      list.push(gap);
    } else {
      map.set(platoonId, [gap]);
    }
  }

  return Array.from(map.entries())
    .map(([platoonId, gaps]) => ({ platoonId, gaps }))
    .sort((a, b) => {
      if (a.gaps.length !== b.gaps.length) {
        return a.gaps.length - b.gaps.length;
      }

      return a.platoonId.localeCompare(b.platoonId);
    });
}

function getCandidateActionsForGap(
  dataset: StrategicPlannerDataset,
  gap: PlatoonMatchingGap,
  perGapLimit: number,
): PlatoonSimulatorAction[] {
  const slot = findDatasetSlotForGap(dataset, gap);
  if (!slot) return [];

  return gap.possibleSources.slice(0, perGapLimit).map((source) => {
    return buildActionForGapSource(slot, source);
  });
}

function generateActionCombosForPlatoon(
  dataset: StrategicPlannerDataset,
  gaps: PlatoonMatchingGap[],
  perGapLimit: number,
  maxGapCount: number,
): PlatoonSimulatorAction[][] {
  const limitedGaps = gaps.slice(0, maxGapCount);
  if (limitedGaps.length === 0) return [];

  const actionsPerGap = limitedGaps.map((gap) =>
    getCandidateActionsForGap(dataset, gap, perGapLimit),
  );

  if (actionsPerGap.some((actions) => actions.length === 0)) {
    return [];
  }

  const results: PlatoonSimulatorAction[][] = [];
  const current: PlatoonSimulatorAction[] = [];
  const usedMembers = new Set<string>();
  const seenCombos = new Set<string>();

  function backtrack(index: number) {
    if (index === actionsPerGap.length) {
      const deduped = dedupeActions(current);
      if (deduped.length !== limitedGaps.length) return;

      const comboKey = deduped
        .map((action) => getActionIdentity(action))
        .sort((a, b) => a.localeCompare(b))
        .join('||');

      if (seenCombos.has(comboKey)) return;
      seenCombos.add(comboKey);

      results.push([...deduped]);
      return;
    }

    for (const action of actionsPerGap[index] ?? []) {
      if (usedMembers.has(action.memberId)) continue;

      usedMembers.add(action.memberId);
      current.push(action);
      backtrack(index + 1);
      current.pop();
      usedMembers.delete(action.memberId);
    }
  }

  backtrack(0);
  return results;
}

function findBestCompletionForPlatoon(
  dataset: StrategicPlannerDataset,
  platoonId: string,
  gaps: PlatoonMatchingGap[],
): NextFullPlatoonResult | null {
  if (gaps.length === 0) return null;

  const perGapLimit = 3;
  const maxGapCount = Math.min(gaps.length, 3);

  let best: NextFullPlatoonResult | null = null;

  for (let gapCount = 1; gapCount <= maxGapCount; gapCount += 1) {
    const combos = generateActionCombosForPlatoon(
      dataset,
      gaps,
      perGapLimit,
      gapCount,
    );

    for (const combo of combos) {
      const candidate = evaluateActionSet(dataset, combo);
      if (!candidate) continue;
      if (candidate.targetPlatoonId !== platoonId) continue;

      if (scoreCandidate(candidate, best)) {
        best = candidate;
      }
    }

    if (best) {
      return best;
    }
  }

  return null;
}

export function findNextFullPlatoon(
  dataset: StrategicPlannerDataset,
  matching: PlatoonMatchingResult,
): NextFullPlatoonResult | null {
  const platoons = groupGapsByPlatoon(matching);

  let best: NextFullPlatoonResult | null = null;

  for (const platoon of platoons) {
    const candidate = findBestCompletionForPlatoon(
      dataset,
      platoon.platoonId,
      platoon.gaps,
    );

    if (candidate && scoreCandidate(candidate, best)) {
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