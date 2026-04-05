import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import type { NextRequest } from 'next/server';

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

function calculateRelicStepRecommendations(
  memberRelic: number,
  memberRarity: number,
  openSlots: Array<{
    phase: number;
    category: string;
    requiredRelic: number;
    requiredRarity: number;
    hasEligibleOwner: boolean;
  }>,
): Array<{
  fromRelic: number;
  toRelic: number;
  slotsByPhase: Map<string, number>;
}> {
  const eligibleSlots = openSlots.filter(
    slot =>
      memberRarity >= slot.requiredRarity &&
      slot.requiredRelic > memberRelic &&
      slot.requiredRelic <= 8
  );

  const targetRelics = [...new Set(eligibleSlots.map(slot => slot.requiredRelic))].sort(
    (a, b) => a - b
  );

  const steps: Array<{
    fromRelic: number;
    toRelic: number;
    slotsByPhase: Map<string, number>;
  }> = [];

  let previousRelic = memberRelic;

  for (const targetRelic of targetRelics) {
    const slotsByPhase = new Map<string, number>();

    for (const slot of eligibleSlots) {
      if (slot.requiredRelic > previousRelic && slot.requiredRelic <= targetRelic) {
        const key = `${slot.phase}:${slot.category}`;
        slotsByPhase.set(key, (slotsByPhase.get(key) || 0) + 1);
      }
    }

    if (slotsByPhase.size > 0) {
      steps.push({
        fromRelic: previousRelic,
        toRelic: targetRelic,
        slotsByPhase,
      });
    }

    previousRelic = targetRelic;
  }

  return steps;
}

/**
 * Berechnet eine verbesserte Upgrade-Kennzahl basierend auf:
 * 1. Slots pro Relic (Grundnutzen)
 * 2. Zone Completion Bonus (Vollständige Zonen sind wertvoller)
 * 3. Coverage Gain (Prozentuale Verbesserung)
 * 4. Effizienz (Günstigster Fortschritt)
 * 
 * Formel: upgradeScore = (baseValue + completionBonus + coverageGain) / normalizedCost
 */
function calculateUpgradeScore(
  slotsUnlocked: number,
  fromRelic: number,
  toRelic: number,
  affectedPhases: Array<{
    phase: number;
    category: string;
    currentCoverage: number;
    newCoverage: number;
    slotsAdded: number;
  }>,
): number {
  const cost = calculateRelicCost(fromRelic, toRelic);
  if (cost <= 0) return 0;

  // Basiswert: Jeder Slot hat einen Grundwert
  const baseValue = slotsUnlocked * 10;

  // Zone Completion Bonus: Wenn eine Zone auf 100% kommt, ist das besonders wertvoll
  let completionBonus = 0;
  let zonesCompletedTo100 = 0;
  
  for (const phase of affectedPhases) {
    // Prüfe ob die Zone durch dieses Upgrade auf 100% kommt
    if (phase.newCoverage === 100 && phase.currentCoverage < 100) {
      zonesCompletedTo100++;
      // Bonus basierend auf wie viele Slots nötig waren um die Zone zu vervollständigen
      completionBonus += 80 + (phase.slotsAdded * 8);
      
      // Extra Bonus für "Finishing Touch" (95%+ → 100%)
      if (phase.currentCoverage >= 95) {
        completionBonus += 30;
      }
    }
  }

  // Coverage Gain: Prozentuale Verbesserung (gewichtet)
  let coverageGain = 0;
  for (const phase of affectedPhases) {
    const coverageImprovement = phase.newCoverage - phase.currentCoverage;
    // Gewichtung: Höherer Bonus wenn Coverage niedrig war (schwerer zu verbessern)
    const weight = phase.currentCoverage < 50 ? 3 : phase.currentCoverage < 80 ? 2 : 1;
    coverageGain += coverageImprovement * weight;
  }

  // Normalisierte Kosten: Log-Skalierung für bessere Vergleichbarkeit
  // (ein Upgrade von R1→R2 ist günstiger als R7→R8, aber nicht linear)
  const normalizedCost = Math.log2(cost + 1);

  // Finale Kennzahl
  const upgradeScore = (baseValue + completionBonus + coverageGain) / normalizedCost;

  return Math.round(upgradeScore * 100) / 100; // Auf 2 Dezimalstellen runden
}

/**
 * Bestimmt die Priorität basierend auf der neuen Upgrade-Kennzahl
 */
function determinePriority(upgradeScore: number): 'top' | 'good' | 'longterm' {
  // Schwellenwerte basierend auf typischen Score-Bereichen:
  // - Top: Score >= 25 (hohe Effizienz, viele Slots, Zonen-Komplettierung)
  // - Good: Score >= 12 (moderate Effizienz)
  // - Longterm: Score < 12 (geringe Effizienz, teure Upgrades)
  if (upgradeScore >= 25) return 'top';
  if (upgradeScore >= 12) return 'good';
  return 'longterm';
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

    // dataset.members contains only active (non-ignored) members
    // as loadStrategicPlannerDatasetForGuildSlug filters them out
    const activeMembers = dataset.members;

    // Erstelle Member-Empfehlungen
const memberRecommendations: MemberRecommendation[] = activeMembers
  .flatMap(member => {
    const memberRoster = dataset.roster.filter(r => r.memberId === member.memberId);
    const recommendations: UpgradeRecommendation[] = [];
    const memberContributions = matching.assignments.filter(
      a => a.memberId === member.memberId
    ).length;

    // Sammle ALLE Units mit Gaps (auch die, die der Member nicht hat)
    const allUnitsWithGaps = new Set(gapsByUnit.keys());

    // Empfehlungen für Units, die der Member bereits hat
    for (const unit of memberRoster) {
      const gaps = gapsByUnit.get(unit.unitBaseId) || [];
      if (gaps.length === 0) continue;

      const openSlotsForUnit = gaps.map(g => ({
        phase: g.phase,
        category: g.planetCategory || 'MIX',
        requiredRelic: g.minRelic,
        requiredRarity: g.minRarity,
        hasEligibleOwner: g.possibleSources.some(s => s.kind === 'eligible'),
      }));

      if (openSlotsForUnit.length === 0) continue;

      const stepRecommendations = calculateRelicStepRecommendations(
        unit.relicTier,
        unit.rarity,
        openSlotsForUnit
      );

      for (const step of stepRecommendations) {
        const slotsUnlocked = Array.from(step.slotsByPhase.values()).reduce((a, b) => a + b, 0);
        if (slotsUnlocked === 0) continue;

        const cost = calculateRelicCost(step.fromRelic, step.toRelic);

        const affectedPhases = Array.from(step.slotsByPhase.entries()).map(([key, count]) => {
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

        const totalCoverageGain = affectedPhases.reduce(
          (sum, phase) => sum + (phase.newCoverage - phase.currentCoverage),
          0
        );

        if (totalCoverageGain <= 0) continue;

        const impactScore = calculateUpgradeScore(
          slotsUnlocked,
          step.fromRelic,
          step.toRelic,
          affectedPhases
        );

        const priority = determinePriority(impactScore);

        recommendations.push({
          unitBaseId: unit.unitBaseId,
          unitName: unit.unitName,
          currentRelic: unit.relicTier,
          recommendedRelic: step.toRelic,
          fromRelic: step.fromRelic,
          toRelic: step.toRelic,
          slotsUnlocked,
          affectedPhases,
          estimatedCost: cost,
          impactScore,
          priority,
        });
      }
    }

    // Empfehlungen für Units, die der Member NICHT hat (acquire)
    for (const unitBaseId of allUnitsWithGaps) {
      // Überspringe Units, die der Member bereits hat
      if (memberRoster.some(u => u.unitBaseId === unitBaseId)) continue;

      const gaps = gapsByUnit.get(unitBaseId) || [];
      if (gaps.length === 0) continue;

      const firstGap = gaps[0];
      const unitName = firstGap.unitName || unitBaseId;

      const openSlotsForUnit = gaps.map(g => ({
        phase: g.phase,
        category: g.planetCategory || 'MIX',
        requiredRelic: g.minRelic,
        requiredRarity: g.minRarity,
        hasEligibleOwner: g.possibleSources.some(s => s.kind === 'eligible'),
      }));

      if (openSlotsForUnit.length === 0) continue;

      const maxRelic = Math.max(...openSlotsForUnit.map(s => s.requiredRelic));
      const maxRarity = Math.max(...openSlotsForUnit.map(s => s.requiredRarity));

      const slotsByPhase = new Map<string, number>();
      for (const slot of openSlotsForUnit) {
        if (maxRarity >= slot.requiredRarity && maxRelic >= slot.requiredRelic) {
          const key = `${slot.phase}:${slot.category}`;
          slotsByPhase.set(key, (slotsByPhase.get(key) || 0) + 1);
        }
      }

      const slotsUnlocked = Array.from(slotsByPhase.values()).reduce((a, b) => a + b, 0);
      if (slotsUnlocked === 0) continue;

      const cost = calculateRelicCost(0, maxRelic);

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

      const totalCoverageGain = affectedPhases.reduce(
        (sum, phase) => sum + (phase.newCoverage - phase.currentCoverage),
        0
      );

      if (totalCoverageGain <= 0) continue;

      const impactScore = calculateUpgradeScore(
        slotsUnlocked,
        0,
        maxRelic,
        affectedPhases
      );

      const priority = determinePriority(impactScore);

      recommendations.push({
        unitBaseId,
        unitName,
        currentRelic: 0,
        recommendedRelic: maxRelic,
        fromRelic: 0,
        toRelic: maxRelic,
        slotsUnlocked,
        affectedPhases,
        estimatedCost: cost,
        impactScore,
        priority,
      });
    }

    // Sortiere nach Impact
    recommendations.sort((a, b) => b.impactScore - a.impactScore);

    // Pro Unit nur die beste Recommendation behalten
    const bestRecommendationByUnit = new Map<string, UpgradeRecommendation>();
    for (const rec of recommendations) {
      const existing = bestRecommendationByUnit.get(rec.unitBaseId);
      if (!existing || rec.impactScore > existing.impactScore) {
        bestRecommendationByUnit.set(rec.unitBaseId, rec);
      }
    }

    const dedupedRecommendations = Array.from(bestRecommendationByUnit.values());
    dedupedRecommendations.sort((a, b) => b.impactScore - a.impactScore);

    // Nur Recommendations für unvollständige Coverage behalten
    let filteredRecommendations = dedupedRecommendations.filter(rec =>
      rec.affectedPhases.some(phase => phase.currentCoverage < 100)
    );

    // Optional auf konkrete Phase/Category filtern
    if (phaseFilter && categoryFilter) {
      const phaseNum = parseInt(phaseFilter);

      filteredRecommendations = filteredRecommendations
        .map(rec => {
          const matchingPhases = rec.affectedPhases.filter(
            p => p.phase === phaseNum && p.category === categoryFilter
          );

          if (matchingPhases.length === 0) return null;

          const slotsUnlockedForFilter = matchingPhases.reduce(
            (sum, p) => sum + p.slotsAdded,
            0
          );

          return {
            ...rec,
            slotsUnlocked: slotsUnlockedForFilter,
            affectedPhases: matchingPhases,
          };
        })
        .filter((rec): rec is UpgradeRecommendation => rec !== null);
    }

    if (filteredRecommendations.length === 0) {
      return [];
    }

    const potentialGain = filteredRecommendations.reduce(
      (sum, r) => sum + r.slotsUnlocked,
      0
    );

    return [{
      memberId: member.memberId,
      playerName: member.playerName,
      allyCode: member.allyCode,
      recommendations: filteredRecommendations.slice(0, 3),
      currentContributions: memberContributions,
      potentialGain,
    }];
  });

    // Sortiere Member nach Potenzial
    memberRecommendations.sort((a, b) => b.potentialGain - a.potentialGain);

    // Realistischere Berechnung: Nur Top-1 Upgrade pro Member zählen
    // (da Member normalerweise nur eine Einheit pro TB upgraden)
    const realisticSlotsUnlockable = memberRecommendations.reduce(
      (sum, m) => sum + (m.recommendations[0]?.slotsUnlocked || 0),
      0
    );

    // Berechne Coverage basierend auf Filter oder Gesamt
    let currentCoverage: number;
    let potentialCoverage: number;
    let totalSlotsUnlockable: number;

    if (phaseFilter && categoryFilter) {
      // Gefilterte Ansicht: nur spezifische Phase/Category
      const phaseNum = parseInt(phaseFilter);
      const filteredCoverage = matching.coverage.find(
        c => c.phase === phaseNum && c.category === categoryFilter
      );
      
      currentCoverage = filteredCoverage?.coveragePercent ?? 0;
      totalSlotsUnlockable = realisticSlotsUnlockable;
      potentialCoverage = filteredCoverage
        ? Math.min(
            Math.round(
              ((filteredCoverage.assignedCount + realisticSlotsUnlockable) / filteredCoverage.requirementCount) * 100
            ),
            95
          )
        : 0;
    } else {
      // Gesamtansicht
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
      incompletePhases: phaseFilter && categoryFilter
        ? incompletePhases.filter(p => p.phase === parseInt(phaseFilter) && p.category === categoryFilter)
        : incompletePhases,
      memberRecommendations: memberRecommendations.filter(m => m.recommendations.length > 0),
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