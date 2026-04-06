import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import { buildUpgradeAdvisory } from '@/lib/services/upgrade-advisory';

export const revalidate = 300;

type UpgradeRecommendationsResponse = {
  guildName: string;
  incompletePhases: {
    phase: number;
    category: string;
    currentCoverage: number;
    totalSlots: number;
    openSlots: number;
  }[];
  memberRecommendations: Array<{
    memberId: string;
    playerName: string;
    allyCode: string | null;
    recommendations: Array<{
      unitBaseId: string;
      unitName: string;
      currentRelic: number;
      recommendedRelic: number;
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
    }>;
    currentContributions: number;
    potentialGain: number;
  }>;
  summary: {
    currentGuildCoverage: number;
    potentialGuildCoverage: number;
    totalSlotsUnlockable: number;
  };
};

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
    const advisory = buildUpgradeAdvisory({
      dataset,
      matching,
      phaseFilter: phaseFilter ? parseInt(phaseFilter, 10) : null,
      categoryFilter,
      maxPerMember: 5,
    });

    const response: UpgradeRecommendationsResponse = {
      guildName: dataset.guild?.name ?? slug,
      incompletePhases: advisory.incompletePhases,
      memberRecommendations: advisory.memberRecommendations.map((member) => ({
        memberId: member.memberId,
        playerName: member.playerName,
        allyCode: member.allyCode,
        recommendations: member.recommendations.map((rec) => ({
          unitBaseId: rec.unitBaseId,
          unitName: rec.unitName,
          currentRelic: rec.currentRelic,
          recommendedRelic: rec.recommendedRelic,
          slotsUnlocked: rec.slotsUnlocked,
          affectedPhases: rec.affectedPhases,
          estimatedCost: rec.estimatedCost,
          impactScore: rec.impactScore,
          priority: rec.priority,
        })),
        currentContributions: member.currentContributions,
        potentialGain: member.potentialGain,
      })),
      summary: advisory.summary,
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
