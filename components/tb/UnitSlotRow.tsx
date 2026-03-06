// components/tb/UnitSlotRow.tsx

'use client';

import { useState } from 'react';
import { GapAnalysisUnit, PlayerCandidate } from '@/lib/types/tb';

interface Props {
  unit: GapAnalysisUnit;
  instanceId: string;
  onAssignmentChange: () => void;
}

export function UnitSlotRow({ unit, instanceId, onAssignmentChange }: Props) {
  const [assigning, setAssigning] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);

  const statusIcons: Record<string, string> = {
    complete: '✅',
    partial: '🟡',
    critical: '🔴',
    empty: '⚫',
  };

  const statusColors: Record<string, string> = {
    complete: 'border-l-emerald-500',
    partial: 'border-l-yellow-500',
    critical: 'border-l-red-500',
    empty: 'border-l-gray-600',
  };

  const handleAssign = async (memberId: string) => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/tb/${instanceId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: unit.requirement.requirementId,
          memberId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onAssignmentChange();
        setShowCandidates(false);
      } else {
        alert(`Fehler: ${data.error}`);
      }
    } catch (error) {
      alert('Zuweisung fehlgeschlagen');
    }
    setAssigning(false);
  };

  const handleUnassign = async (assignmentId: string) => {
    if (!confirm('Zuweisung wirklich entfernen?')) return;

    try {
      const res = await fetch(`/api/tb/${instanceId}/assign`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });

      const data = await res.json();
      if (data.success) {
        onAssignmentChange();
      }
    } catch (error) {
      alert('Entfernen fehlgeschlagen');
    }
  };

  return (
    <div className={`border-l-4 ${statusColors[unit.status]} border-b border-gray-800 last:border-b-0`}>
      {/* Main Row */}
      <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
        {/* Status */}
        <div className="col-span-1 text-center text-lg">
          {statusIcons[unit.status]}
        </div>

        {/* Unit Info */}
        <div className="col-span-3">
          <p className="font-medium text-sm">{unit.requirement.unitName}</p>
          <p className="text-xs text-gray-500">
            {unit.requirement.isPlatoon ? 'Platoon' : 'Combat Mission'}
            {unit.requirement.platoonPosition && ` #${unit.requirement.platoonPosition}`}
          </p>
        </div>

        {/* Required Relic */}
        <div className="col-span-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-purple-900/50
                           text-purple-300 text-xs font-mono border border-purple-700">
            R{unit.requirement.minRelic}
          </span>
        </div>

        {/* Assigned Players */}
        <div className="col-span-3">
          {unit.assignedPlayers.length > 0 ? (
            <div className="space-y-1">
              {unit.assignedPlayers.map((player) => (
                <div
                  key={player.assignmentId}
                  className="flex items-center justify-between bg-gray-800 rounded px-2 py-1"
                >
                  <span className="text-sm">
                    {player.playerName}
                    <span className={`ml-1 text-xs ${
                      player.relicTier >= unit.requirement.minRelic
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}>
                      (R{player.relicTier})
                    </span>
                  </span>
                  <button
                    onClick={() => handleUnassign(player.assignmentId)}
                    className="text-red-400 hover:text-red-300 text-xs ml-2"
                    title="Entfernen"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-gray-500 italic">Niemand zugewiesen</span>
          )}
        </div>

        {/* Action: Assign Button / Dropdown */}
        <div className="col-span-4">
          {unit.gapCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowCandidates(!showCandidates)}
                className="w-full px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border
                           border-gray-700 rounded-lg text-sm text-left transition-colors
                           flex items-center justify-between"
              >
                <span>
                  {unit.qualifiedPlayers.length > 0 ? (
                    <span className="text-emerald-400">
                      {unit.qualifiedPlayers.length} verfügbar
                    </span>
                  ) : unit.nearMissPlayers.length > 0 ? (
                    <span className="text-yellow-400">
                      {unit.nearMissPlayers.length} fast bereit
                    </span>
                  ) : (
                    <span className="text-red-400">Keine Kandidaten</span>
                  )}
                </span>
                <span>{showCandidates ? '▲' : '▼'}</span>
              </button>

              {/* Candidate Dropdown */}
              {showCandidates && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1
                                bg-gray-800 border border-gray-700 rounded-lg
                                shadow-2xl max-h-64 overflow-y-auto">
                  {/* Qualified Players */}
                  {unit.qualifiedPlayers.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-xs text-emerald-400
                                      bg-emerald-900/20 border-b border-gray-700 font-semibold">
                        ✓ Erfüllt Anforderung
                      </div>
                      {unit.qualifiedPlayers.map((candidate) => (
                        <CandidateRow
                          key={candidate.allyCode}
                          candidate={candidate}
                          minRelic={unit.requirement.minRelic}
                          onAssign={() => handleAssign(candidate.memberId)}
                          assigning={assigning}
                        />
                      ))}
                    </>
                  )}

                  {/* Near-Miss Players */}
                  {unit.nearMissPlayers.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-xs text-yellow-400
                                      bg-yellow-900/20 border-b border-gray-700 font-semibold">
                        ⚠ Fast bereit (unterhalb Anforderung)
                      </div>
                      {unit.nearMissPlayers.map((candidate) => (
                        <CandidateRow
                          key={candidate.allyCode}
                          candidate={candidate}
                          minRelic={unit.requirement.minRelic}
                          onAssign={() => handleAssign(candidate.memberId)}
                          assigning={assigning}
                          isNearMiss
                        />
                      ))}
                    </>
                  )}

                  {unit.qualifiedPlayers.length === 0 && unit.nearMissPlayers.length === 0 && (
                    <div className="px-3 py-4 text-center text-gray-500 text-sm">
                      Kein Mitglied besitzt diese Unit
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {unit.gapCount === 0 && (
            <span className="text-emerald-400 text-sm font-medium">
              ✓ Vollständig
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  minRelic,
  onAssign,
  assigning,
  isNearMiss = false,
}: {
  candidate: PlayerCandidate;
  minRelic: number;
  onAssign: () => void;
  assigning: boolean;
  isNearMiss?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2
                    hover:bg-gray-700/50 border-b border-gray-700/50
                    last:border-b-0 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{candidate.playerName}</span>
          {candidate.isAlreadyAssignedElsewhere && (
            <span className="text-[10px] px-1.5 py-0.5 bg-orange-900/50
                             text-orange-300 rounded border border-orange-700"
                  title="Bereits für andere Unit in dieser Phase zugewiesen">
              BUSY
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-mono ${
            candidate.relicTier >= minRelic ? 'text-emerald-400' : 'text-red-400'
          }`}>
            R{candidate.relicTier}
          </span>
          {candidate.relicDeficit > 0 && (
            <span className="text-[10px] text-red-400">
              (fehlt {candidate.relicDeficit})
            </span>
          )}
          {candidate.assignmentCount > 0 && (
            <span className="text-[10px] text-gray-500">
              {candidate.assignmentCount} Zuweisungen
            </span>
          )}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onAssign();
        }}
        disabled={assigning}
        className={`
          px-3 py-1 rounded text-xs font-medium transition-colors
          disabled:opacity-50
          ${isNearMiss
            ? 'bg-yellow-700 hover:bg-yellow-600 text-yellow-100'
            : 'bg-emerald-700 hover:bg-emerald-600 text-emerald-100'
          }
        `}
      >
        {assigning ? '...' : 'Zuweisen'}
      </button>
    </div>
  );
}