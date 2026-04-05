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
  slotsUnlocked: number; // realistisch nutzbare zusätzliche Slots (max. 1 pro Phase/Kategorie)
  matchingOpenSlots: number; // wie viele offene Gaps dieser Step grundsätzlich matchen würde
  affectedPhases: {
    phase: number;
    category: string;
    currentCoverage: number;
    newCoverage: number;
    slotsAdded: number; // bewusst max. 1 pro Phase/Kategorie
  }[];
  estimatedCost: number;
  impactScore: number; // fachlicher Score für Anzeige
  finalScore: number; // Ranking-Score inkl. globaler Diversifizierung
  priority: 'top' | 'good' | 'longterm';
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

function determinePriority(upgradeScore: number): 'top' | 'good' | 'longterm' {
  if (upgradeScore >= 55) return 'top';
  if (upgradeScore >= 28) return 'good';
  return 'longterm';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

    // Für echte Upgrade-Empfehlungen nur Upgrade-Kandidaten betrachten.
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
          // Kleinster sinnvoller nächster Schritt zuerst.
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

          // Realistische Nutzbarkeit: max. 1 Slot pro Phase/Kategorie.
          const affectedPhasesMap = new Map<string, number>();
          for (const candidate of exactStepMatches) {
            const key = `${candidate.phase}:${candidate.category}`;
            affectedPhasesMap.set(key, 1);
          }

          const affectedPhases = Array.from(affectedPhasesMap.entries()).map(([key]) => {
            const [phase, category] = key.split(':');
            const phaseNum = parseInt(phase, 10);

            const coverage = matching.coverage.find(
              (c) => c.phase === phaseNum && c.category === category
            );

            return {
              phase: phaseNum,
              category,
              currentCoverage: coverage?.coveragePercent || 0,
              newCoverage: coverage
                ? Math.min(
                    100,
                    Math.round(
                      ((coverage.assignedCount + 1) / coverage.requirementCount) * 100
                    )
                  )
                : 0,
              slotsAdded: 1,
            };
          });

          const slotsUnlocked = Math.max(1, affectedPhases.length);
          const matchingOpenSlots = exactStepMatches.length;

          const stepSize = Math.max(1, best.toRelic - best.fromRelic);
          const cost = calculateRelicCost(best.fromRelic, best.toRelic);

          const unitOpenGapCount = openGapCountByUnit.get(unitBaseId)?.size ?? 0;
          const unitDistinctMemberCount = distinctMemberCountByUnit.get(unitBaseId)?.size ?? 1;
          const exactStepMemberCount =
            distinctMemberCountByExactStep.get(
              `${unitBaseId}:${best.fromRelic}:${best.toRelic}`
            )?.size ?? 1;

          // Wenn wenige Members diese Unit / genau diesen Step liefern können,
          // steigt die Priorität deutlich.
          const scarcityRatio = unitOpenGapCount / Math.max(1, unitDistinctMemberCount);
          const scarcityBonus = Math.min(28, scarcityRatio * 8);

          const exactStepUniquenessBonus =
            exactStepMemberCount === 1
              ? 20
              : Math.max(0, 16 - (exactStepMemberCount - 1) * 2);

          const ubiquityPenalty = Math.max(0, (unitDistinctMemberCount - 3) * 1.5);
          const largeStepPenalty = (stepSize - 1) * 8;
          const costPenalty = Math.max(0, cost / 180 - 2);
          const flexibilityBonus = Math.max(0, (slotsUnlocked - 1) * 3);

          const completionBonus = affectedPhases.reduce((sum, phase) => {
            if (phase.currentCoverage < 100 && phase.newCoverage === 100) {
              return sum + 12;
            }
            return sum;
          }, 0);

          const impactScore = round2(
            best.score +
              scarcityBonus +
              exactStepUniquenessBonus +
              flexibilityBonus +
              completionBonus -
              ubiquityPenalty -
              largeStepPenalty -
              costPenalty
          );

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
            priority: determinePriority(impactScore),
          };
        })
        .sort((a, b) => {
          if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
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
          potentialGain: recommendations.reduce(
            (sum, recommendation) => sum + recommendation.slotsUnlocked,
            0
          ),
        },
      ];
    });

    // Erst Members grob nach Potenzial vorsortieren.
    memberRecommendations.sort((a, b) => {
      if (b.potentialGain !== a.potentialGain) {
        return b.potentialGain - a.potentialGain;
      }
      if (a.currentContributions !== b.currentContributions) {
        return a.currentContributions - b.currentContributions;
      }
      return a.playerName.localeCompare(b.playerName);
    });

    // Danach globale Diversifizierung:
    // häufig bereits vergebene Units verlieren nur fürs Ranking etwas an Gewicht.
    const globalUnitUsage = new Map<string, number>();

    for (const memberRecommendation of memberRecommendations) {
      const rescored = memberRecommendation.recommendations
        .map((recommendation) => {
          const usage = globalUnitUsage.get(recommendation.unitBaseId) ?? 0;
          const diversityPenalty = round2(Math.log2(usage + 1) * 5);

          const finalScore = round2(
            Math.max(
              recommendation.impactScore * 0.45,
              recommendation.impactScore - diversityPenalty
            )
          );

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
          recommendation.impactScore >= 45 &&
          recommendation.toRelic - recommendation.fromRelic >= 2;

        if (isLargeMetaStep && hasLargeMetaStep) {
          continue;
        }

        seenUnits.add(recommendation.unitBaseId);
        if (isLargeMetaStep) hasLargeMetaStep = true;
        picked.push(recommendation);
      }

      memberRecommendation.recommendations = picked;
      memberRecommendation.potentialGain = picked.reduce(
        (sum, recommendation) => sum + recommendation.slotsUnlocked,
        0
      );

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
