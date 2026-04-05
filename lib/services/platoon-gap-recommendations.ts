import type {
  PlatoonMatchingGap,
  PlatoonMatchingResult,
} from '@/lib/types/platoon-readiness';

export type GapRecommendationActionType = 'use_unused' | 'upgrade' | 'acquire';

export type GapRecommendationCandidate = {
  gapKey: string;
  memberId: string;
  playerName: string;
  allyCode: string;
  unitBaseId: string;
  unitName: string;
  actionType: GapRecommendationActionType;
  fromRelic: number;
  toRelic: number;
  fromRarity: number;
  toRarity: number;
  missingRelicTiers: number;
  missingRarity: number;
  score: number;
  phase: number;
  category: string;
  platoonKey: string;
  platoonNumber: number;
  requirementId: string;
  slotNumber: number;
};

export function getGapRecommendationKey(gap: Pick<PlatoonMatchingGap, 'platoonKey' | 'requirementId' | 'slotNumber'>): string {
  return `${gap.platoonKey}:${gap.requirementId}:${gap.slotNumber}`;
}

export function calculateRelicCost(fromRelic: number, toRelic: number): number {
  const costs: Record<number, number> = {
    1: 50,
    2: 75,
    3: 100,
    4: 150,
    5: 200,
    6: 300,
    7: 400,
    8: 500,
  };

  let totalCost = 0;
  for (let i = fromRelic + 1; i <= toRelic; i++) {
    totalCost += costs[i] || 500;
  }
  return totalCost;
}

function scoreCandidate(input: {
  actionType: GapRecommendationActionType;
  missingRelicTiers: number;
  missingRarity: number;
  memberContributions: number;
}): number {
  const contributionPenalty = Math.min(input.memberContributions * 0.6, 18);

  if (input.actionType === 'use_unused') {
    return 1000 - contributionPenalty;
  }

  if (input.actionType === 'upgrade') {
    return (
      100
      - input.missingRelicTiers * 12
      - input.missingRarity * 4
      - contributionPenalty
    );
  }

  return 0;
}

export function buildGapRecommendationCandidates(input: {
  matching: PlatoonMatchingResult;
  allyCodeByMemberId: Map<string, string>;
  rosterByMemberUnit: Map<string, { relicTier: number; rarity: number }>;
  contributionCountByMemberId?: Map<string, number>;
}): GapRecommendationCandidate[] {
  const rows: GapRecommendationCandidate[] = [];

  for (const gap of input.matching.gaps) {
    const gapKey = getGapRecommendationKey(gap);

    if (gap.possibleSources.length > 0) {
      for (const source of gap.possibleSources) {
        const rosterKey = `${source.memberId}:${gap.unitBaseId}`;
        const rosterEntry = input.rosterByMemberUnit.get(rosterKey);

        const fromRelic = rosterEntry?.relicTier ?? 0;
        const fromRarity = rosterEntry?.rarity ?? 0;

        const actionType: GapRecommendationActionType =
          source.kind === 'eligible' ? 'use_unused' : 'upgrade';

        const score = scoreCandidate({
          actionType,
          missingRelicTiers: source.missingRelicTiers,
          missingRarity: source.missingRarity,
          memberContributions: input.contributionCountByMemberId?.get(source.memberId) ?? 0,
        });

        rows.push({
          gapKey,
          memberId: source.memberId,
          playerName: source.playerName,
          allyCode: input.allyCodeByMemberId.get(source.memberId) ?? '',
          unitBaseId: gap.unitBaseId,
          unitName: gap.unitName ?? gap.unitBaseId,
          actionType,
          fromRelic,
          toRelic: Math.max(fromRelic, gap.minRelic),
          fromRarity,
          toRarity: Math.max(fromRarity, gap.minRarity),
          missingRelicTiers: source.missingRelicTiers,
          missingRarity: source.missingRarity,
          score,
          phase: gap.phase,
          category: gap.planetCategory ?? 'MIX',
          platoonKey: gap.platoonKey,
          platoonNumber: gap.platoonNumber,
          requirementId: gap.requirementId,
          slotNumber: gap.slotNumber,
        });
      }

      continue;
    }

    rows.push({
      gapKey,
      memberId: '',
      playerName: '',
      allyCode: '',
      unitBaseId: gap.unitBaseId,
      unitName: gap.unitName ?? gap.unitBaseId,
      actionType: 'acquire',
      fromRelic: 0,
      toRelic: gap.minRelic,
      fromRarity: 0,
      toRarity: gap.minRarity,
      missingRelicTiers: gap.minRelic,
      missingRarity: gap.minRarity,
      score: 0,
      phase: gap.phase,
      category: gap.planetCategory ?? 'MIX',
      platoonKey: gap.platoonKey,
      platoonNumber: gap.platoonNumber,
      requirementId: gap.requirementId,
      slotNumber: gap.slotNumber,
    });
  }

  rows.sort(
    (a, b) =>
      b.score - a.score ||
      a.missingRelicTiers - b.missingRelicTiers ||
      a.missingRarity - b.missingRarity ||
      a.playerName.localeCompare(b.playerName)
  );

  return rows;
}

export function buildBestGapCandidateMap(
  candidates: GapRecommendationCandidate[],
): Map<string, GapRecommendationCandidate> {
  const map = new Map<string, GapRecommendationCandidate>();

  for (const candidate of candidates) {
    const existing = map.get(candidate.gapKey);
    if (!existing || candidate.score > existing.score) {
      map.set(candidate.gapKey, candidate);
    }
  }

  return map;
}

export function formatGapRecommendationLabel(candidate?: GapRecommendationCandidate): string {
  if (!candidate || candidate.actionType === 'acquire') {
    return 'Acquire or unlock unit';
  }

  if (candidate.actionType === 'use_unused') {
    return `Assign ${candidate.playerName}`;
  }

  const parts: string[] = [];
  if (candidate.missingRelicTiers > 0) parts.push(`+${candidate.missingRelicTiers} relic`);
  if (candidate.missingRarity > 0) parts.push(`+${candidate.missingRarity} star`);

  return `Upgrade ${candidate.playerName}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}