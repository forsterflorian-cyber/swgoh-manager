import { simulatePlatoonScenario } from '@/lib/services/platoon-simulator';
import type {
  NextFullPlatoonResult,
  PlatoonSimulatorAction,
  SequentialFullPlatoonPlan,
} from '@/lib/types/platoon-simulator';
import type { StrategicPlannerDataset } from '@/lib/types/platoon-readiness';

type AnyRecord = Record<string, unknown>;

type SlotLike = StrategicPlannerDataset['slots'][number] & {
  slotKey: string;
  unitBaseId: string;
  phase: string | number;
  zoneKey: string;
  platoonKey: string;
  requiredRarity: number | null;
  requiredRelicTier: number | null;
  planetCategory?: string | null;
  eligibleRoster?: AnyRecord[];
};

type DraftCandidate = {
  targetPlatoonId: string;
  actions: PlatoonSimulatorAction[];
  missingSlots: number;
  totalGapScore: number;
};

export function findSequentialFullPlatoonPlan(
  dataset: StrategicPlannerDataset,
): SequentialFullPlatoonPlan {
  const drafts = buildDraftCandidates(dataset);

  if (drafts.length === 0) {
    return {
      first: null,
      second: null,
    };
  }

  const concrete = drafts
    .slice(0, 8)
    .map((draft) => toConcreteCandidate(dataset, draft))
    .filter((candidate): candidate is NextFullPlatoonResult => candidate !== null)
    .sort(compareCandidates);

  return {
    first: concrete[0] ?? null,
    second: concrete[1] ?? null,
  };
}

function buildDraftCandidates(dataset: StrategicPlannerDataset): DraftCandidate[] {
  const slots = (dataset.slots as unknown as SlotLike[]).filter(
    (slot) => typeof slot.slotKey === 'string' && typeof slot.unitBaseId === 'string',
  );

  const roster = dataset.roster as unknown as AnyRecord[];
  const byPlatoon = new Map<string, SlotLike[]>();

  for (const slot of slots) {
    const platoonId = getTargetPlatoonId(slot);
    const existing = byPlatoon.get(platoonId);

    if (existing) {
      existing.push(slot);
    } else {
      byPlatoon.set(platoonId, [slot]);
    }
  }

  const drafts: DraftCandidate[] = [];

  for (const [targetPlatoonId, platoonSlots] of byPlatoon.entries()) {
    const coverState = computeCurrentCoverState(platoonSlots);

    if (coverState.uncoveredSlots.length === 0) {
      continue;
    }

    const usedMemberIds = new Set(coverState.usedMemberIds);
    const actions: PlatoonSimulatorAction[] = [];
    let totalGapScore = 0;
    let feasible = true;

    for (const slot of coverState.uncoveredSlots) {
      const nearMiss = findBestNearMiss(slot, roster, usedMemberIds);
      if (!nearMiss) {
        feasible = false;
        break;
      }

      usedMemberIds.add(nearMiss.memberId);
      totalGapScore += nearMiss.gapScore;

      actions.push({
        id: buildActionId(slot.slotKey, nearMiss.memberId),
        type: 'MAKE_SLOT_ELIGIBLE',
        slotKey: slot.slotKey,
        memberId: nearMiss.memberId,
        reason: 'availability',
      });
    }

    if (!feasible || actions.length === 0) {
      continue;
    }

    drafts.push({
      targetPlatoonId,
      actions,
      missingSlots: coverState.uncoveredSlots.length,
      totalGapScore,
    });
  }

  drafts.sort((a, b) => {
    if (a.missingSlots !== b.missingSlots) {
      return a.missingSlots - b.missingSlots;
    }

    if (a.totalGapScore !== b.totalGapScore) {
      return a.totalGapScore - b.totalGapScore;
    }

    if (a.actions.length !== b.actions.length) {
      return a.actions.length - b.actions.length;
    }

    return a.targetPlatoonId.localeCompare(b.targetPlatoonId);
  });

  return drafts;
}

function toConcreteCandidate(
  dataset: StrategicPlannerDataset,
  draft: DraftCandidate,
): NextFullPlatoonResult | null {
  const simulation = simulatePlatoonScenario(dataset, draft.actions);
  const delta = simulation.delta;

  if (delta.deltaFullPlatoons <= 0 && delta.deltaCoveredSlots <= 0) {
    return null;
  }

  return {
    targetPlatoonId: draft.targetPlatoonId,
    actions: draft.actions,
    deltaCoveredSlots: delta.deltaCoveredSlots,
    deltaFullPlatoons: delta.deltaFullPlatoons,
    changedAssignmentCount: delta.changedAssignmentCount,
    displacedAssignmentCount: delta.displacedAssignmentCount,
    becameFullPlatoonIds: delta.becameFullPlatoonIds,
    noLongerFullPlatoonIds: delta.noLongerFullPlatoonIds,
  } as unknown as NextFullPlatoonResult;
}

function compareCandidates(a: NextFullPlatoonResult, b: NextFullPlatoonResult): number {
  if (a.deltaFullPlatoons !== b.deltaFullPlatoons) {
    return b.deltaFullPlatoons - a.deltaFullPlatoons;
  }

  if (a.deltaCoveredSlots !== b.deltaCoveredSlots) {
    return b.deltaCoveredSlots - a.deltaCoveredSlots;
  }

  if ((a.displacedAssignmentCount ?? 0) !== (b.displacedAssignmentCount ?? 0)) {
    return (a.displacedAssignmentCount ?? 0) - (b.displacedAssignmentCount ?? 0);
  }

  if (a.changedAssignmentCount !== b.changedAssignmentCount) {
    return a.changedAssignmentCount - b.changedAssignmentCount;
  }

  if (a.actions.length !== b.actions.length) {
    return a.actions.length - b.actions.length;
  }

  return a.targetPlatoonId.localeCompare(b.targetPlatoonId);
}

function buildActionId(slotKey: string, memberId: string): string {
  return `sim:${slotKey}:${memberId}`;
}

function getTargetPlatoonId(slot: SlotLike): string {
  return `${String(slot.phase)}::${slot.zoneKey}::${slot.platoonKey}`;
}

function computeCurrentCoverState(slots: SlotLike[]): {
  usedMemberIds: Set<string>;
  uncoveredSlots: SlotLike[];
} {
  const ordered = [...slots].sort((a, b) => {
    const aCount = Array.isArray(a.eligibleRoster) ? a.eligibleRoster.length : 0;
    const bCount = Array.isArray(b.eligibleRoster) ? b.eligibleRoster.length : 0;

    if (aCount !== bCount) {
      return aCount - bCount;
    }

    return a.slotKey.localeCompare(b.slotKey);
  });

  const usedMemberIds = new Set<string>();
  const uncoveredSlots: SlotLike[] = [];

  for (const slot of ordered) {
    const eligible = Array.isArray(slot.eligibleRoster) ? slot.eligibleRoster : [];
    let covered = false;

    for (const entry of eligible) {
      const memberId = getMemberId(entry);
      if (!memberId || usedMemberIds.has(memberId)) {
        continue;
      }

      usedMemberIds.add(memberId);
      covered = true;
      break;
    }

    if (!covered) {
      uncoveredSlots.push(slot);
    }
  }

  return {
    usedMemberIds,
    uncoveredSlots,
  };
}

function findBestNearMiss(
  slot: SlotLike,
  roster: AnyRecord[],
  forbiddenMemberIds: Set<string>,
): { memberId: string; gapScore: number } | null {
  const alreadyEligibleMemberIds = new Set(
    (Array.isArray(slot.eligibleRoster) ? slot.eligibleRoster : [])
      .map((entry) => getMemberId(entry))
      .filter((value): value is string => !!value),
  );

  let best: { memberId: string; gapScore: number } | null = null;

  for (const entry of roster) {
    const memberId = getMemberId(entry);
    const unitBaseId = getString(entry, 'unitBaseId', 'baseId', 'defId');

    if (!memberId || !unitBaseId) continue;
    if (unitBaseId !== slot.unitBaseId) continue;
    if (forbiddenMemberIds.has(memberId)) continue;
    if (alreadyEligibleMemberIds.has(memberId)) continue;

    const rarity = getNumber(entry, 'rarity', 'currentRarity', 'starCount') ?? 0;
    const relicTier = getNumber(entry, 'relicTier', 'currentRelicTier') ?? 0;

    const rarityGap = Math.max(0, (slot.requiredRarity ?? 0) - rarity);
    const relicGap = Math.max(0, (slot.requiredRelicTier ?? 0) - relicTier);

    const gapScore = rarityGap * 100 + relicGap;

    if (!best || gapScore < best.gapScore) {
      best = {
        memberId,
        gapScore,
      };
    }
  }

  return best;
}

function getMemberId(record: AnyRecord | null | undefined): string | null {
  return getString(record, 'memberId', 'playerId');
}

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