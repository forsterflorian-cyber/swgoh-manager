import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import {
  buildGapRecommendationCandidates,
  calculateRelicCost,
} from '@/lib/services/platoon-gap-recommendations';

export const revalidate = 300;

type UpgradeRecommendation = {
  unitBaseId: string;
  unitName: string;
  currentRelic: number;
  recommendedRelic: number;
  fromRelic: number;
  toRelic: number;
  slotsUnlocked: number;
  matchingOpenSlots: number;
  affectedPhases: {
    phase: number;
    category: string;
    currentCoverage: number;
    newCoverage: number;
    slotsAdded: number;
  }[];
  estimatedCost: number;
  impactScore: number;
  finalScore: number;
  priority: 'top' | 'good' | 'longterm';
  primaryReason:
    | 'unique_upgrade'
    | 'scarce_unit'
    | 'good_tradeoff'
    | 'broad_match'
    | 'longterm';
};

type MemberRecommendation = {
  memberId: string;
  playerName: string;
  allyCode: string | null;
  recommendations: UpgradeRecommendation[];
  currentContributions: number;
  potentialGain: number;
};

type UpgradeRecommendationsResponse = {
  guildName: string;
  incompletePhases: {
    phase: number;
    category: string;
    currentCoverage: number;
    totalSlots: number;
    openSlots: number;
  }[];
  memberRecommendations: MemberRecommendation[];
  summary: {
    currentGuildCoverage: number;
    potentialGuildCoverage: number;
    totalSlotsUnlockable: number;
  };
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function determinePriority(
  upgradeScore: number,
  _primaryReason: UpgradeRecommendation['primaryReason']
): UpgradeRecommendation['priority'] {
  if (upgradeScore >= 18) return 'top';
  if (upgradeScore >= 10) return 'good';
  return 'longterm';
}

function getPrimaryReason(input: {
  exactStepMemberCount: number;
  unitDistinctMemberCount: number;
  matchingOpenSlots: number;
  stepSize: number;
  impactScore: number;
}): UpgradeRecommendation['primaryReason'] {
  if (input.exactStepMemberCount === 1) return 'unique_upgrade';
  if (input.unitDistinctMemberCount <= 2) return 'scarce_unit';
  if (input.stepSize === 1 && input.impactScore >= 6) return 'good_tradeoff';
  if (input.matchingOpenSlots >= 3) return 'broad_match';
  return 'longterm';
}

function buildSetMap(values: Array<[string, string]>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [key, value] of values) {
    const existing = map.get(key) ?? new Set<string>();
    existing.add(value);
    map.set(key, existing);
  }
  return map;
}

function pickBestImmediateTarget(
  matching: ReturnType<typeof computePlatoonMatching>,
  candidates: Array<{
    phase: number;
    category: string;
  }>
) {
  const uniqueKeys = new Set(candidates.map((c) => `${c.phase}:${c.category}`));

  const phaseEntries = Array.from(uniqueKeys).map((key) => {
    const [phaseRaw, category] = key.split(':');
    const phase = parseInt(phaseRaw, 10);
    const coverage = matching.coverage.find(
      (c) => c.phase === phase && c.category === category
    );

    const currentCoverage = coverage?.coveragePercent || 0;
    const requirementCount = coverage?.requirementCount || 0;
    const assignedCount = coverage?.assignedCount || 0;
    const openSlots = Math.max(0, requirementCount - assignedCount);
    const newCoverage = coverage
      ? Math.min(
          100,
          Math.round(((assignedCount + 1) / requirementCount) * 100)
        )
      : 0;

    return {
      phase,
      category,
      currentCoverage,
      newCoverage,
      openSlots,
      completesZone: currentCoverage < 100 && newCoverage === 100,
    };
  });

  phaseEntries.sort((a, b) => {
    if (a.completesZone !== b.completesZone) return a.completesZone ? -1 : 1;
    if (a.openSlots !== b.openSlots) return b.openSlots - a.openSlots;
    if (a.currentCoverage !== b.currentCoverage) return a.currentCoverage - b.currentCoverage;
    if (a.phase !== b.phase) return a.phase - b.phase;
    return a.category.localeCompare(b.category);
  });

  return phaseEntries[0] ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const phaseFilter = searchParams.get('phase');
    const categoryFilter = searchParams.get('category');

    const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

    if (!dataset.guild || !dataset.reference) {
      notFound();
    }

    const matching = computePlatoonMatching(dataset);

    const incompletePhases = matching.coverage
      .filter((c) => c.coveragePercent < 100)
      .map((c) => ({
        phase: c.phase,
        category: c.category,
        currentCoverage: c.coveragePercent,
        totalSlots: c.requirementCount,
        openSlots: c.requirementCount - c.assignedCount,
      }));

    const activeMembers = dataset.members;

    const rosterByMemberUnit = new Map(
      dataset.roster.map((r) => [
        `${r.memberId}:${r.unitBaseId}`,
        { relicTier: r.relicTier, rarity: r.rarity },
      ])
    );

    const allyCodeByMemberId = new Map(
      dataset.members.map((m) => [m.memberId, m.allyCode ?? ''])
    );

    const contributionCountByMemberId = new Map<string, number>();
    for (const assignment of matching.assignments) {
      contributionCountByMemberId.set(
        assignment.memberId,
        (contributionCountByMemberId.get(assignment.memberId) ?? 0) + 1
      );
    }

    const allGapCandidates = buildGapRecommendationCandidates({
      matching,
      allyCodeByMemberId,
      rosterByMemberUnit,
      contributionCountByMemberId,
    });

    let relevantCandidates = allGapCandidates.filter(
      (candidate) => candidate.actionType === 'upgrade'
    );

    if (phaseFilter && categoryFilter) {
      const phaseNum = parseInt(phaseFilter, 10);
      relevantCandidates = relevantCandidates.filter(
        (candidate) =>
          candidate.phase === phaseNum && candidate.category === categoryFilter
      );
    }

    const openGapCountByUnit = buildSetMap(
      relevantCandidates.map((candidate) => [candidate.unitBaseId, candidate.gapKey])
    );

    const distinctMemberCountByUnit = buildSetMap(
      relevantCandidates.map((candidate) => [candidate.unitBaseId, candidate.memberId])
    );

    const distinctMemberCountByExactStep = buildSetMap(
      relevantCandidates.map((candidate) => [
        `${candidate.unitBaseId}:${candidate.fromRelic}:${candidate.toRelic}`,
        candidate.memberId,
      ])
    );

    const memberRecommendations: MemberRecommendation[] = activeMembers.flatMap((member) => {
      const memberContributions = contributionCountByMemberId.get(member.memberId) ?? 0;

      const memberCandidates = relevantCandidates.filter(
        (candidate) => candidate.memberId === member.memberId
      );

      if (memberCandidates.length === 0) {
        return [];
      }

      const groupedByUnit = new Map<string, typeof memberCandidates>();
      for (const candidate of memberCandidates) {
        const existing = groupedByUnit.get(candidate.unitBaseId) ?? [];
        existing.push(candidate);
        groupedByUnit.set(candidate.unitBaseId, existing);
      }

      const recommendations: UpgradeRecommendation[] = Array.from(groupedByUnit.entries())
        .map(([unitBaseId, candidates]) => {
          candidates.sort(
            (a, b) =>
              a.missingRelicTiers - b.missingRelicTiers ||
              a.missingRarity - b.missingRarity ||
              a.toRelic - b.toRelic ||
              b.score - a.score
          );

          const best = candidates[0];

          const exactStepMatches = candidates.filter(
            (candidate) =>
              candidate.toRelic === best.toRelic &&
              candidate.fromRelic === best.fromRelic &&
              candidate.missingRelicTiers === best.missingRelicTiers &&
              candidate.missingRarity === best.missingRarity
          );

          const bestImmediateTarget = pickBestImmediateTarget(
            matching,
            exactStepMatches.map((candidate) => ({
              phase: candidate.phase,
              category: candidate.category,
            }))
          );

          if (!bestImmediateTarget) {
            return null;
          }

          const affectedPhases = [
            {
              phase: bestImmediateTarget.phase,
              category: bestImmediateTarget.category,
              currentCoverage: bestImmediateTarget.currentCoverage,
              newCoverage: bestImmediateTarget.newCoverage,
              slotsAdded: 1,
            },
          ];

          const slotsUnlocked = 1;
          const matchingOpenSlots = exactStepMatches.length;

const stepSize = Math.max(1, best.toRelic - best.fromRelic);
const cost = calculateRelicCost(best.fromRelic, best.toRelic);

const unitOpenGapCount = openGapCountByUnit.get(unitBaseId)?.size ?? 0;
const unitDistinctMemberCount = distinctMemberCountByUnit.get(unitBaseId)?.size ?? 1;
const exactStepMemberCount =
  distinctMemberCountByExactStep.get(
    `${unitBaseId}:${best.fromRelic}:${best.toRelic}`
  )?.size ?? 1;

const slotValue = 8;

const stepEfficiency =
  stepSize === 1 ? 4 :
  stepSize === 2 ? 1 :
  stepSize === 3 ? -2 :
  stepSize === 4 ? -4 :
  -6;

const zoneNeed =
  bestImmediateTarget.openSlots >= 30 ? 4 :
  bestImmediateTarget.openSlots >= 20 ? 3 :
  bestImmediateTarget.openSlots >= 10 ? 2 :
  1;

const completionBonus = bestImmediateTarget.completesZone ? 3 : 0;

const costPenalty =
  cost <= 500 ? 0 :
  cost <= 1000 ? 1 :
  cost <= 1400 ? 3 :
  5;

const baseScore =
  slotValue +
  stepEfficiency +
  zoneNeed +
  completionBonus -
  costPenalty;

const exactStepScarcity =
  exactStepMemberCount === 1 ? 6 :
  exactStepMemberCount === 2 ? 4 :
  exactStepMemberCount === 3 ? 2 :
  0;

const unitScarcity =
  unitDistinctMemberCount <= 2 ? 3 :
  unitDistinctMemberCount <= 4 ? 2 :
  unitDistinctMemberCount <= 7 ? 1 :
  0;

const flexibilityBonus =
  matchingOpenSlots >= 4 ? 2 :
  matchingOpenSlots >= 2 ? 1 :
  0;

const ubiquityPenalty =
  unitDistinctMemberCount >= 14 ? 4 :
  unitDistinctMemberCount >= 10 ? 2 :
  0;

const scarcityScore =
  exactStepScarcity +
  unitScarcity +
  flexibilityBonus -
  ubiquityPenalty;

const impactScore = round2(Math.max(0, baseScore + scarcityScore));

          const primaryReason = getPrimaryReason({
            exactStepMemberCount,
            unitDistinctMemberCount,
            matchingOpenSlots,
            stepSize,
            impactScore,
          });

          return {
            unitBaseId,
            unitName: best.unitName,
            currentRelic: best.fromRelic,
            recommendedRelic: best.toRelic,
            fromRelic: best.fromRelic,
            toRelic: best.toRelic,
            slotsUnlocked,
            matchingOpenSlots,
            affectedPhases,
            estimatedCost: cost,
            impactScore,
            finalScore: impactScore,
            priority: determinePriority(impactScore, primaryReason),
            primaryReason,
          };
        })
        .filter((recommendation): recommendation is UpgradeRecommendation => recommendation !== null)
        .sort((a, b) => {
          if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
          if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
          if (a.toRelic - a.fromRelic !== b.toRelic - b.fromRelic) {
            return (a.toRelic - a.fromRelic) - (b.toRelic - b.fromRelic);
          }
          if (a.estimatedCost !== b.estimatedCost) {
            return a.estimatedCost - b.estimatedCost;
          }
          return a.unitName.localeCompare(b.unitName);
        });

      return [
        {
          memberId: member.memberId,
          playerName: member.playerName,
          allyCode: member.allyCode,
          recommendations,
          currentContributions: memberContributions,
          potentialGain: recommendations.length,
        },
      ];
    });

    memberRecommendations.sort((a, b) => {
      if (b.potentialGain !== a.potentialGain) {
        return b.potentialGain - a.potentialGain;
      }
      if (a.currentContributions !== b.currentContributions) {
        return a.currentContributions - b.currentContributions;
      }
      return a.playerName.localeCompare(b.playerName);
    });

    const globalUnitUsage = new Map<string, number>();

    for (const memberRecommendation of memberRecommendations) {
      const rescored = memberRecommendation.recommendations
        .map((recommendation) => {
const usage = globalUnitUsage.get(recommendation.unitBaseId) ?? 0;

const diversityPenalty =
  usage >= 6 ? 3 :
  usage >= 3 ? 1.5 :
  0;

const finalScore = round2(Math.max(0, recommendation.impactScore - diversityPenalty));

          return {
            ...recommendation,
            finalScore,
          };
        })
        .sort((a, b) => {
          if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
          if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
          if (a.toRelic - a.fromRelic !== b.toRelic - b.fromRelic) {
            return (a.toRelic - a.fromRelic) - (b.toRelic - b.fromRelic);
          }
          if (a.estimatedCost !== b.estimatedCost) {
            return a.estimatedCost - b.estimatedCost;
          }
          return a.unitName.localeCompare(b.unitName);
        });

      const picked: UpgradeRecommendation[] = [];
      const seenUnits = new Set<string>();
      let hasLargeMetaStep = false;

      for (const recommendation of rescored) {
        if (picked.length >= 3) break;
        if (seenUnits.has(recommendation.unitBaseId)) continue;

        const isLargeMetaStep =
          recommendation.impactScore >= 14 &&
          recommendation.toRelic - recommendation.fromRelic >= 2;

        if (isLargeMetaStep && hasLargeMetaStep) {
          continue;
        }

        seenUnits.add(recommendation.unitBaseId);
        if (isLargeMetaStep) hasLargeMetaStep = true;
        picked.push(recommendation);
      }

      memberRecommendation.recommendations = picked;
      memberRecommendation.potentialGain = picked.length;

      for (const recommendation of picked) {
        globalUnitUsage.set(
          recommendation.unitBaseId,
          (globalUnitUsage.get(recommendation.unitBaseId) ?? 0) + 1
        );
      }
    }

    memberRecommendations.sort((a, b) => {
      if (b.potentialGain !== a.potentialGain) {
        return b.potentialGain - a.potentialGain;
      }
      if (a.currentContributions !== b.currentContributions) {
        return a.currentContributions - b.currentContributions;
      }
      return a.playerName.localeCompare(b.playerName);
    });

    const realisticSlotsUnlockable = memberRecommendations.reduce(
      (sum, memberRecommendation) =>
        sum + (memberRecommendation.recommendations[0]?.slotsUnlocked || 0),
      0
    );

    let currentCoverage: number;
    let potentialCoverage: number;
    let totalSlotsUnlockable: number;

    if (phaseFilter && categoryFilter) {
      const phaseNum = parseInt(phaseFilter, 10);
      const filteredCoverage = matching.coverage.find(
        (c) => c.phase === phaseNum && c.category === categoryFilter
      );

      currentCoverage = filteredCoverage?.coveragePercent ?? 0;
      totalSlotsUnlockable = realisticSlotsUnlockable;
      potentialCoverage = filteredCoverage
        ? Math.min(
            Math.round(
              ((filteredCoverage.assignedCount + realisticSlotsUnlockable) /
                filteredCoverage.requirementCount) *
                100
            ),
            95
          )
        : 0;
    } else {
      currentCoverage = matching.coveragePercent;
      totalSlotsUnlockable = realisticSlotsUnlockable;
      potentialCoverage = Math.min(
        Math.round(
          ((matching.totalAssigned + realisticSlotsUnlockable) / matching.totalRequired) * 100
        ),
        95
      );
    }

    const response: UpgradeRecommendationsResponse = {
      guildName: dataset.guild.name || slug,
      incompletePhases:
        phaseFilter && categoryFilter
          ? incompletePhases.filter(
              (phase) =>
                phase.phase === parseInt(phaseFilter, 10) &&
                phase.category === categoryFilter
            )
          : incompletePhases,
      memberRecommendations,
      summary: {
        currentGuildCoverage: currentCoverage,
        potentialGuildCoverage: potentialCoverage,
        totalSlotsUnlockable,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Upgrade recommendations error:', error);
    return NextResponse.json(
      { error: 'Failed to generate upgrade recommendations' },
      { status: 500 }
    );
  }
}
