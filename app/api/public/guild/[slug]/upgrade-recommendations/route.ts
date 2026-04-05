import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
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
  affectedPhases: {
    phase: number;
    category: string;
    currentCoverage: number;
    newCoverage: number;
    slotsAdded: number;
  }[];
  estimatedCost: number;
  impactScore: number;
  priority: 'top' | 'good' | 'longterm';
};

type MemberRecommendation = {
  memberId: string;
  playerName: string;
  allyCode: string;
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

function determinePriority(score: number): 'top' | 'good' | 'longterm' {
  if (score >= 25) return 'top';
  if (score >= 12) return 'good';
  return 'longterm';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
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
      ]),
    );

    const allyCodeByMemberId = new Map(
      dataset.members.map((m) => [m.memberId, m.allyCode ?? '']),
    );

    const contributionCountByMemberId = new Map<string, number>();
    for (const assignment of matching.assignments) {
      contributionCountByMemberId.set(
        assignment.memberId,
        (contributionCountByMemberId.get(assignment.memberId) ?? 0) + 1,
      );
    }

    const gapCandidates = buildGapRecommendationCandidates({
      matching,
      allyCodeByMemberId,
      rosterByMemberUnit,
      contributionCountByMemberId,
    });

    const memberRecommendations: MemberRecommendation[] = activeMembers.flatMap((member) => {
      const memberContributions = contributionCountByMemberId.get(member.memberId) ?? 0;

      let memberCandidates = gapCandidates.filter(
        (candidate) =>
          candidate.memberId === member.memberId && candidate.actionType !== 'acquire',
      );

      if (phaseFilter && categoryFilter) {
        const phaseNum = parseInt(phaseFilter, 10);
        memberCandidates = memberCandidates.filter(
          (candidate) =>
            candidate.phase === phaseNum && candidate.category === categoryFilter,
        );
      }

      if (memberCandidates.length === 0) {
        return [];
      }

      const groupedByUnit = new Map<string, typeof memberCandidates>();
      for (const candidate of memberCandidates) {
        const existing = groupedByUnit.get(candidate.unitBaseId) || [];
        existing.push(candidate);
        groupedByUnit.set(candidate.unitBaseId, existing);
      }

      const recommendations: UpgradeRecommendation[] = Array.from(groupedByUnit.entries())
        .map(([unitBaseId, candidates]) => {
          candidates.sort(
            (a, b) =>
              b.score - a.score ||
              a.missingRelicTiers - b.missingRelicTiers ||
              a.missingRarity - b.missingRarity,
          );

          const best = candidates[0];
          const slotsUnlocked = candidates.length;

          const affectedPhasesMap = new Map<string, number>();
          for (const candidate of candidates) {
            const key = `${candidate.phase}:${candidate.category}`;
            affectedPhasesMap.set(key, (affectedPhasesMap.get(key) || 0) + 1);
          }

          const affectedPhases = Array.from(affectedPhasesMap.entries()).map(([key, count]) => {
            const [phase, category] = key.split(':');
            const phaseNum = parseInt(phase, 10);
            const coverage = matching.coverage.find(
              (c) => c.phase === phaseNum && c.category === category,
            );

            return {
              phase: phaseNum,
              category,
              currentCoverage: coverage?.coveragePercent || 0,
              newCoverage: coverage
                ? Math.min(
                    100,
                    Math.round(
                      ((coverage.assignedCount + count) / coverage.requirementCount) * 100,
                    ),
                  )
                : 0,
              slotsAdded: count,
            };
          });

          const impactScore = best.score + slotsUnlocked * 5;
          const priority = determinePriority(impactScore);

          return {
            unitBaseId,
            unitName: best.unitName,
            currentRelic: best.fromRelic,
            recommendedRelic: best.toRelic,
            fromRelic: best.fromRelic,
            toRelic: best.toRelic,
            slotsUnlocked,
            affectedPhases,
            estimatedCost: calculateRelicCost(best.fromRelic, best.toRelic),
            impactScore,
            priority,
          };
        })
        .sort((a, b) => b.impactScore - a.impactScore);

      return [
        {
          memberId: member.memberId,
          playerName: member.playerName,
          allyCode: member.allyCode,
          recommendations: recommendations.slice(0, 3),
          currentContributions: memberContributions,
          potentialGain: recommendations.reduce((sum, rec) => sum + rec.slotsUnlocked, 0),
        },
      ];
    });

    memberRecommendations.sort((a, b) => b.potentialGain - a.potentialGain);

    const realisticSlotsUnlockable = memberRecommendations.reduce(
      (sum, m) => sum + (m.recommendations[0]?.slotsUnlocked || 0),
      0,
    );

    let currentCoverage: number;
    let potentialCoverage: number;
    let totalSlotsUnlockable: number;

    if (phaseFilter && categoryFilter) {
      const phaseNum = parseInt(phaseFilter, 10);
      const filteredCoverage = matching.coverage.find(
        (c) => c.phase === phaseNum && c.category === categoryFilter,
      );

      currentCoverage = filteredCoverage?.coveragePercent ?? 0;
      totalSlotsUnlockable = realisticSlotsUnlockable;
      potentialCoverage = filteredCoverage
        ? Math.min(
            Math.round(
              ((filteredCoverage.assignedCount + realisticSlotsUnlockable) /
                filteredCoverage.requirementCount) *
                100,
            ),
            95,
          )
        : 0;
    } else {
      currentCoverage = matching.coveragePercent;
      totalSlotsUnlockable = realisticSlotsUnlockable;
      potentialCoverage = Math.min(
        Math.round(
          ((matching.totalAssigned + realisticSlotsUnlockable) / matching.totalRequired) * 100,
        ),
        95,
      );
    }

    const response: UpgradeRecommendationsResponse = {
      guildName: dataset.guild.name || slug,
      incompletePhases:
        phaseFilter && categoryFilter
          ? incompletePhases.filter(
              (p) => p.phase === parseInt(phaseFilter, 10) && p.category === categoryFilter,
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
      { status: 500 },
    );
  }
}
