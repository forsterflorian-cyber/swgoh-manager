import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import { getIgnoredMemberIds } from '@/lib/services/platoon-readiness';
import type { NextRequest } from 'next/server';

export const revalidate = 300;

type UpgradeRecommendation = {
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

function calculateRelicCost(fromRelic: number, toRelic: number): number {
  // Vereinfachte Kostenberechnung basierend auf Relic-Stufen
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

function calculateUpgradeImpact(
  memberRelic: number,
  memberRarity: number,
  openSlots: Array<{
    phase: number;
    category: string;
    requiredRelic: number;
    requiredRarity: number;
    hasEligibleOwner: boolean;
  }>,
): { maxRelic: number; slotsByPhase: Map<string, number> } {
  const slotsByPhase = new Map<string, number>();
  let maxRelic = memberRelic;

  for (const slot of openSlots) {
    // Nur Rarity prüfen - hasEligibleOwner ignorieren
    if (memberRarity < slot.requiredRarity) continue;
    
    if (memberRelic < slot.requiredRelic && slot.requiredRelic <= 8) {
      maxRelic = Math.max(maxRelic, slot.requiredRelic);
      const key = `${slot.phase}:${slot.category}`;
      slotsByPhase.set(key, (slotsByPhase.get(key) || 0) + 1);
    }
  }

  return { maxRelic, slotsByPhase };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

    if (!dataset.guild || !dataset.reference) {
      notFound();
    }

    const matching = computePlatoonMatching(dataset);
    
    // Finde unvollständige Phasen/Kategorien
    const incompletePhases = matching.coverage
      .filter(c => c.coveragePercent < 100)
      .map(c => ({
        phase: c.phase,
        category: c.category,
        currentCoverage: c.coveragePercent,
        totalSlots: c.requirementCount,
        openSlots: c.requirementCount - c.assignedCount,
      }));

    // Gruppiere Gaps nach Unit
    const gapsByUnit = new Map<string, typeof matching.gaps>();
    for (const gap of matching.gaps) {
      const existing = gapsByUnit.get(gap.unitBaseId) || [];
      existing.push(gap);
      gapsByUnit.set(gap.unitBaseId, existing);
    }

    // Filter out ignored members
    const ignoredMemberIds = dataset.guild?.id ? await getIgnoredMemberIds(dataset.guild.id) : new Set();
    const activeMembers = dataset.members.filter(m => !ignoredMemberIds.has(m.memberId));

    // Erstelle Member-Empfehlungen
    const memberRecommendations: MemberRecommendation[] = activeMembers.map(member => {
      const memberRoster = dataset.roster.filter(r => r.memberId === member.memberId);
      const recommendations: UpgradeRecommendation[] = [];
      const memberContributions = matching.assignments.filter(
        a => a.memberId === member.memberId
      ).length;

      for (const unit of memberRoster) {
        const gaps = gapsByUnit.get(unit.unitBaseId) || [];
        if (gaps.length === 0) continue;

        // Prüfe, welche Slots durch Upgrade freigeschaltet werden könnten
        // Vereinfachte Filterung: Alle Gaps für diese Unit
        const openSlotsForUnit = gaps
          .map(g => ({
            phase: g.phase,
            category: g.planetCategory || 'MIX',
            requiredRelic: g.minRelic,
            requiredRarity: g.minRarity,
            hasEligibleOwner: g.possibleSources.some(s => s.kind === 'eligible'),
          }));

        if (openSlotsForUnit.length === 0) continue;

        const { maxRelic, slotsByPhase } = calculateUpgradeImpact(
          unit.relicTier,
          unit.rarity,
          openSlotsForUnit
        );

        if (maxRelic <= unit.relicTier) continue;

        const slotsUnlocked = Array.from(slotsByPhase.values()).reduce((a, b) => a + b, 0);
        const cost = calculateRelicCost(unit.relicTier, maxRelic);
        const impactScore = cost > 0 ? slotsUnlocked / cost : 0;

        const affectedPhases = Array.from(slotsByPhase.entries()).map(([key, count]) => {
          const [phase, category] = key.split(':');
          const coverage = matching.coverage.find(
            c => c.phase === parseInt(phase) && c.category === category
          );
          return {
            phase: parseInt(phase),
            category,
            currentCoverage: coverage?.coveragePercent || 0,
            newCoverage: coverage
              ? Math.round(
                  ((coverage.assignedCount + count) / coverage.requirementCount) * 100
                )
              : 0,
            slotsAdded: count,
          };
        });

        let priority: 'top' | 'good' | 'longterm';
        if (impactScore >= 0.015) priority = 'top';
        else if (impactScore >= 0.008) priority = 'good';
        else priority = 'longterm';

        recommendations.push({
          unitBaseId: unit.unitBaseId,
          unitName: unit.unitName,
          currentRelic: unit.relicTier,
          recommendedRelic: maxRelic,
          slotsUnlocked,
          affectedPhases,
          estimatedCost: cost,
          impactScore,
          priority,
        });
      }

      // Sortiere nach Impact
      recommendations.sort((a, b) => b.impactScore - a.impactScore);

      const potentialGain = recommendations.reduce((sum, r) => sum + r.slotsUnlocked, 0);

      return {
        memberId: member.memberId,
        playerName: member.playerName,
        allyCode: member.allyCode,
        recommendations: recommendations.slice(0, 5), // Top 5
        currentContributions: memberContributions,
        potentialGain,
      };
    });

    // Sortiere Member nach Potenzial
    memberRecommendations.sort((a, b) => b.potentialGain - a.potentialGain);

    // Realistischere Berechnung: Nur Top-1 Upgrade pro Member zählen
    // (da Member normalerweise nur eine Einheit pro TB upgraden)
    const realisticSlotsUnlockable = memberRecommendations.reduce(
      (sum, m) => sum + (m.recommendations[0]?.slotsUnlocked || 0),
      0
    );

    const currentCoverage = matching.coveragePercent;
    // Potenzielle Coverage: Maximal 95% (realistischer)
    const potentialCoverage = Math.min(
      Math.round(
        ((matching.totalAssigned + realisticSlotsUnlockable) / matching.totalRequired) * 100
      ),
      95
    );

    const response: UpgradeRecommendationsResponse = {
      guildName: dataset.guild.name || slug,
      incompletePhases,
      memberRecommendations: memberRecommendations.filter(m => m.recommendations.length > 0),
      summary: {
        currentGuildCoverage: currentCoverage,
        potentialGuildCoverage: potentialCoverage,
        totalSlotsUnlockable: realisticSlotsUnlockable,
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