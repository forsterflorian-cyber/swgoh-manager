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
    // Nur Rarity prüfen
    if (memberRarity < slot.requiredRarity) continue;
    
    // Zähle Slots die der Member bereits füllen kann
    // (auch wenn ein anderer Member eligible ist, ist der Slot vielleicht nicht zugewiesen)
    if (memberRelic >= slot.requiredRelic) {
      const key = `${slot.phase}:${slot.category}`;
      slotsByPhase.set(key, (slotsByPhase.get(key) || 0) + 1);
    }
    
    // Upgrade empfehlen wenn Member Relic niedriger ist als benötigt
    // Auch wenn bereits ein eligible Owner existiert (da dieser vielleicht nicht zugewiesen ist)
    if (memberRelic < slot.requiredRelic && slot.requiredRelic <= 8) {
      maxRelic = Math.max(maxRelic, slot.requiredRelic);
      const key = `${slot.phase}:${slot.category}`;
      slotsByPhase.set(key, (slotsByPhase.get(key) || 0) + 1);
    }
  }

  return { maxRelic, slotsByPhase };
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
      completionBonus += 50 + (phase.slotsAdded * 5);
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
  // - Top: Score >= 30 (hohe Effizienz, viele Slots, Zonen-Komplettierung)
  // - Good: Score >= 15 (moderate Effizienz)
  // - Longterm: Score < 15 (geringe Effizienz, teure Upgrades)
  if (upgradeScore >= 30) return 'top';
  if (upgradeScore >= 15) return 'good';
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
    const memberRecommendations: MemberRecommendation[] = activeMembers.map(member => {
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

        // Verwende die neue Upgrade-Kennzahl
        const impactScore = calculateUpgradeScore(
          slotsUnlocked,
          unit.relicTier,
          maxRelic,
          affectedPhases
        );
        const priority = determinePriority(impactScore);

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

      // Empfehlungen für Units, die der Member NICHT hat (acquire)
      for (const unitBaseId of allUnitsWithGaps) {
        // Überspringe Units, die der Member bereits hat
        if (memberRoster.some(u => u.unitBaseId === unitBaseId)) continue;

        const gaps = gapsByUnit.get(unitBaseId) || [];
        if (gaps.length === 0) continue;

        // Finde die Unit-Informationen aus den Gaps
        const firstGap = gaps[0];
        const unitName = firstGap.unitName || unitBaseId;

        const openSlotsForUnit = gaps
          .map(g => ({
            phase: g.phase,
            category: g.planetCategory || 'MIX',
            requiredRelic: g.minRelic,
            requiredRarity: g.minRarity,
            hasEligibleOwner: g.possibleSources.some(s => s.kind === 'eligible'),
          }));

        if (openSlotsForUnit.length === 0) continue;

        // Finde das höchste benötigte Relic
        const maxRelic = Math.max(...openSlotsForUnit.map(s => s.requiredRelic));
        const maxRarity = Math.max(...openSlotsForUnit.map(s => s.requiredRarity));

        // Berechne die Anzahl der Slots, die freigeschaltet würden
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

        // Verwende die neue Upgrade-Kennzahl
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
          slotsUnlocked,
          affectedPhases,
          estimatedCost: cost,
          impactScore,
          priority,
        });
      }

      // Sortiere nach Impact
      recommendations.sort((a, b) => b.impactScore - a.impactScore);

      // Filtere nach unvollständigen Phasen
      let filteredRecommendations = recommendations.filter(rec => {
        return rec.affectedPhases.some(phase => phase.currentCoverage < 100);
      });

      // Filtere nach spezifischer Phase/Category wenn Query-Parameter gesetzt sind
      if (phaseFilter && categoryFilter) {
        const phaseNum = parseInt(phaseFilter);
        filteredRecommendations = filteredRecommendations
          .map(rec => {
            // Filtere affectedPhases auf die ausgewählte Phase/Category
            const matchingPhases = rec.affectedPhases.filter(
              p => p.phase === phaseNum && p.category === categoryFilter
            );
            if (matchingPhases.length === 0) return null;
            
            // Berechne slotsUnlocked nur für die gefilterte Phase
            const slotsUnlockedForFilter = matchingPhases.reduce((sum, p) => sum + p.slotsAdded, 0);
            
            return {
              ...rec,
              slotsUnlocked: slotsUnlockedForFilter,
              affectedPhases: matchingPhases,
            };
          })
          .filter((rec): rec is NonNullable<typeof rec> => rec !== null);
      }

      const potentialGain = filteredRecommendations.reduce((sum, r) => sum + r.slotsUnlocked, 0);

      return {
        memberId: member.memberId,
        playerName: member.playerName,
        allyCode: member.allyCode,
        recommendations: filteredRecommendations.slice(0, 10), // Top 10
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