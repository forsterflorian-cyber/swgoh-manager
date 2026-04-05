'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

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

type UpgradeRecommendationsData = {
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

type Props = {
  slug: string;
};

const PRIORITY_CONFIG = {
  top: {
    label: 'Top Empfehlung',
    icon: '🔥',
    variant: 'success' as const,
    description: 'Hohe Effizienz, viele Slots, Zonen-Komplettierung',
  },
  good: {
    label: 'Guter Trade-off',
    icon: '💡',
    variant: 'info' as const,
    description: 'Moderate Effizienz mit gutem Nutzen',
  },
  longterm: {
    label: 'Langfristig',
    icon: '📝',
    variant: 'neutral' as const,
    description: 'Geringe Effizienz, teure Upgrades',
  },
};

function UpgradeCard({
  recommendation,
  playerName,
}: {
  recommendation: UpgradeRecommendation;
  playerName: string;
}) {
  const config = PRIORITY_CONFIG[recommendation.priority];

  return (
    <Card variant={recommendation.priority === 'top' ? 'success' : 'default'}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{config.icon}</span>
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          
          <h3 className="text-lg font-semibold text-white">
            {recommendation.unitName}
          </h3>
          
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="neutral">R{recommendation.currentRelic}</Badge>
            <span className="text-gray-400">→</span>
            <Badge variant="warning">R{recommendation.recommendedRelic}</Badge>
            <span className="text-sm text-gray-400">
              (+{recommendation.recommendedRelic - recommendation.currentRelic} Relic)
            </span>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-gray-300">Wirkung:</p>
            {recommendation.affectedPhases.map((phase, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">
                  Phase {phase.phase} {phase.category}:
                </span>
                <span className="text-white">
                  +{phase.slotsAdded} Slot{phase.slotsAdded > 1 ? 's' : ''}
                </span>
                <span className="text-gray-500">
                  ({phase.currentCoverage}% → {phase.newCoverage}%)
                </span>
                {phase.newCoverage === 100 && phase.currentCoverage < 100 && (
                  <Badge variant="success">🎉 Planet vollständig!</Badge>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-400">Kosten:</span>
              <span className="ml-2 text-white">~{recommendation.estimatedCost} Relic-Mat</span>
            </div>
            <div>
              <span className="text-gray-400">Upgrade Score:</span>
              <span className="ml-2 text-white font-semibold">
                {recommendation.impactScore.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {recommendation.slotsUnlocked} Slots für {recommendation.recommendedRelic - recommendation.currentRelic} Relic
          </div>
        </div>
      </div>
    </Card>
  );
}

function PhaseOverview({
  phases,
}: {
  phases: UpgradeRecommendationsData['incompletePhases'];
}) {
  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">
        📊 Phasen-Übersicht (nur unvollständige)
      </h3>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="py-2 px-3 text-left text-gray-400">Phase</th>
              <th className="py-2 px-3 text-left text-gray-400">Kategorie</th>
              <th className="py-2 px-3 text-left text-gray-400">Status</th>
              <th className="py-2 px-3 text-right text-gray-400">Offene Slots</th>
            </tr>
          </thead>
          <tbody>
            {phases.map((phase, idx) => (
              <tr key={idx} className="border-b border-gray-800/50">
                <td className="py-3 px-3 font-medium text-white">
                  P{phase.phase}
                </td>
                <td className="py-3 px-3 text-gray-300">
                  {phase.category}
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          phase.currentCoverage >= 80
                            ? 'bg-emerald-500'
                            : phase.currentCoverage >= 50
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${phase.currentCoverage}%` }}
                      />
                    </div>
                    <span className="text-gray-300 w-12 text-right">
                      {phase.currentCoverage}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <Badge variant={phase.openSlots > 10 ? 'danger' : phase.openSlots > 5 ? 'warning' : 'neutral'}>
                    {phase.openSlots}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function UpgradeRecommendations({ slug }: Props) {
  const [data, setData] = useState<UpgradeRecommendationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [phaseCategoryFilter, setPhaseCategoryFilter] = useState<string>('all');
  const [exported, setExported] = useState(false);

  const handleExportReport = async () => {
    if (!data) return;

    const completedPhases = data.incompletePhases.filter(p => p.currentCoverage === 100);
    const partiallyCompletePhases = data.incompletePhases.filter(p => p.currentCoverage >= 80);

    const memberList = data.memberRecommendations
      .slice(0, 10)
      .map(m => {
        const topRec = m.recommendations[0];
        if (!topRec) return null;
        return `**${m.playerName}**: ${topRec.unitName} R${topRec.currentRelic}→R${topRec.recommendedRelic} (+${topRec.slotsUnlocked} Slots)`;
      })
      .filter(Boolean)
      .join('\n');

    const phaseList = data.incompletePhases
      .filter(p => p.currentCoverage < 100)
      .map(p => {
        const emoji = p.currentCoverage >= 80 ? '🟢' : p.currentCoverage >= 50 ? '🟡' : '🔴';
        return `${emoji} P${p.phase} ${p.category}: ${p.currentCoverage}% (${p.openSlots} offen)`;
      })
      .join('\n');

    const text = `📊 **${data.guildName} - TB Upgrade Report**

🎯 **Guild Progress**
• Aktuelle Coverage: **${data.summary.currentGuildCoverage}%**
• Potentielle Coverage: **${data.summary.potentialGuildCoverage}%**
• Mögliche Slots: **+${data.summary.totalSlotsUnlockable}**

${completedPhases.length > 0 ? `✅ **Vollständige Phasen:** ${completedPhases.map(p => `P${p.phase} ${p.category}`).join(', ')}\n\n` : ''}${phaseList ? `📋 **Offene Phasen:**\n${phaseList}\n\n` : ''}${memberList ? `👥 **Top Empfehlungen:**\n${memberList}\n\n` : ''}_Generiert von SWGOH Manager_`;

    try {
      await navigator.clipboard.writeText(text);
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Baue Query-Parameter basierend auf Filter
        const params = new URLSearchParams();
        if (phaseCategoryFilter !== 'all') {
          const [phase, category] = phaseCategoryFilter.split('-');
          params.set('phase', phase);
          params.set('category', category);
        }
        
        const queryString = params.toString();
        const url = `/api/public/guild/${slug}/upgrade-recommendations${queryString ? `?${queryString}` : ''}`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load recommendations');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [slug, phaseCategoryFilter]);

  const filteredMembers = useMemo(() => {
    if (!data) return [];
    
    let members = data.memberRecommendations;
    
    if (selectedMember) {
      members = members.filter(m => m.memberId === selectedMember);
    }
    
    // Filterung erfolgt bereits serverseitig über Query-Parameter
    // Hier nur noch clientseitiger Filter für den ausgewählten Member
    
    return members;
  }, [data, selectedMember]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Lade Upgrade-Empfehlungen...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card variant="danger">
        <p className="text-rose-200">
          Fehler beim Laden der Empfehlungen: {error}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header mit Summary */}
      <Card variant="highlight">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">
              🎯 Upgrade-Empfehlungen
            </h2>
            <p className="mt-2 text-gray-300">
              Die 3 nächsten besten Schritte für jedes Mitglied. Gilde schafft aktuell{' '}
              <span className="font-semibold text-white">
                {data.summary.currentGuildCoverage}%
              </span>
              . Mit den empfohlenen Upgrades könnten wir auf{' '}
              <span className="font-semibold text-emerald-300">
                {data.summary.potentialGuildCoverage}%
              </span>{' '}
              kommen.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">
                +{data.summary.totalSlotsUnlockable}
              </div>
              <div className="text-xs text-gray-400">Slots möglich</div>
            </div>
            <Button variant="secondary" onClick={handleExportReport}>
              {exported ? '✓ Kopiert!' : '📋 Report für Discord'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Phasen-Übersicht */}
      <PhaseOverview phases={data.incompletePhases} />

      {/* Filter */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Spieler</label>
            <select
              value={selectedMember || 'all'}
              onChange={(e) => setSelectedMember(e.target.value === 'all' ? null : e.target.value)}
              className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="all">Alle Spieler</option>
              {data.memberRecommendations.map(m => (
                <option key={m.memberId} value={m.memberId}>
                  {m.playerName} ({m.potentialGain} Slots)
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-sm text-gray-400 block mb-1">Phase & Kategorie</label>
            <select
              value={phaseCategoryFilter}
              onChange={(e) => setPhaseCategoryFilter(e.target.value)}
              className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="all">Alle unvollständigen</option>
              {data.incompletePhases.map(p => (
                <option key={`${p.phase}-${p.category}`} value={`${p.phase}-${p.category}`}>
                  P{p.phase} {p.category} ({p.currentCoverage}%)
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Empfehlungen pro Member */}
      <div className="space-y-6">
        {filteredMembers.length === 0 ? (
          <Card>
            <p className="text-center text-gray-400 py-8">
              Keine Upgrade-Empfehlungen für die aktuelle Filterung gefunden.
            </p>
          </Card>
        ) : (
          filteredMembers.map(member => (
            <div key={member.memberId} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {member.playerName}
                  </h3>
                  <p className="text-sm text-gray-400">
                    Code: {member.allyCode} · Aktuell: {member.currentContributions} Slots
                  </p>
                </div>
                <Badge variant={member.potentialGain > 5 ? 'success' : member.potentialGain > 2 ? 'warning' : 'neutral'}>
                  +{member.potentialGain} Slots möglich
                </Badge>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                {member.recommendations.map((rec, idx) => (
                  <UpgradeCard
                    key={`${member.memberId}-${rec.unitBaseId}-${idx}`}
                    recommendation={rec}
                    playerName={member.playerName}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}