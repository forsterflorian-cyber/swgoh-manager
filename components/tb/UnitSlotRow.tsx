'use client';

import { useState } from 'react';

import type { GapAnalysisUnit, PlayerCandidate } from '@/lib/types/tb';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

interface Props {
  unit: GapAnalysisUnit;
  instanceId: string;
  onAssignmentChange: () => void;
}

export function UnitSlotRow({ unit, instanceId, onAssignmentChange }: Props) {
  const [assigning, setAssigning] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);

  const statusIcons: Record<string, string> = {
    complete: 'OK',
    partial: 'READY',
    critical: 'WARN',
    empty: 'OPEN',
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
          tbPlatoonSlotId: unit.requirement.tbPlatoonSlotId,
          memberId,
        }),
      });

      const data = (await res.json()) as ApiEnvelope<{ assigned: true }>;

      if (res.ok && data.ok) {
        onAssignmentChange();
        setShowCandidates(false);
      } else {
        alert(`Error: ${data.ok ? 'Assignment failed' : data.error}`);
      }
    } catch {
      alert('Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    if (!confirm('Remove this assignment?')) {
      return;
    }

    try {
      const res = await fetch(`/api/tb/${instanceId}/assign`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });

      const data = (await res.json()) as ApiEnvelope<{ removed: true }>;

      if (res.ok && data.ok) {
        onAssignmentChange();
      } else if (!data.ok) {
        alert(`Error: ${data.error}`);
      }
    } catch {
      alert('Unassign failed');
    }
  };

  return (
    <div className={`border-l-4 ${statusColors[unit.status]} border-b border-gray-800 last:border-b-0`}>
      <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
        <div className="col-span-1 text-center text-[11px] font-semibold text-gray-300">
          {statusIcons[unit.status]}
        </div>

        <div className="col-span-3">
          <p className="font-medium text-sm">
            {unit.requirement.unitName || unit.requirement.unitBaseId}
          </p>
          <p className="text-xs text-gray-500">
            Platoon {unit.requirement.platoonNumber}, slot {unit.requirement.slotNumber}
          </p>
        </div>

        <div className="col-span-1">
          <span className="inline-flex items-center rounded border border-blue-700 bg-blue-900/40 px-2 py-0.5 font-mono text-xs text-blue-200">
            R{unit.requirement.minRelic}
          </span>
        </div>

        <div className="col-span-3">
          {unit.assignedPlayers.length > 0 ? (
            <div className="space-y-1">
              {unit.assignedPlayers.map((player) => (
                <div
                  key={player.assignmentId}
                  className="flex items-center justify-between rounded bg-gray-800 px-2 py-1"
                >
                  <span className="text-sm">
                    {player.playerName}
                    <span
                      className={`ml-1 text-xs ${
                        player.relicTier >= unit.requirement.minRelic
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      (R{player.relicTier})
                    </span>
                    {player.hasConflict && (
                      <span className="ml-2 rounded border border-orange-700 bg-orange-900/50 px-1.5 py-0.5 text-[10px] text-orange-200">
                        CONFLICT
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => void handleUnassign(player.assignmentId)}
                    className="ml-2 text-xs text-red-400 hover:text-red-300"
                    title="Remove assignment"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm italic text-gray-500">Nobody assigned</span>
          )}
        </div>

        <div className="col-span-4">
          {unit.gapCount > 0 ? (
            <div className="relative">
              <button
                onClick={() => setShowCandidates((value) => !value)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-left text-sm transition-colors hover:bg-gray-700"
              >
                <span>
                  {unit.qualifiedPlayers.length > 0 ? (
                    <span className="text-emerald-400">
                      {unit.qualifiedPlayers.length} ready
                    </span>
                  ) : unit.nearMissPlayers.length > 0 ? (
                    <span className="text-yellow-400">
                      {unit.nearMissPlayers.length} near misses
                    </span>
                  ) : (
                    <span className="text-red-400">No candidates</span>
                  )}
                </span>
                <span>{showCandidates ? '^' : 'v'}</span>
              </button>

              {showCandidates && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-2xl">
                  {unit.qualifiedPlayers.length > 0 && (
                    <>
                      <div className="border-b border-gray-700 bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                        Ready
                      </div>
                      {unit.qualifiedPlayers.map((candidate) => (
                        <CandidateRow
                          key={`${candidate.allyCode}-${candidate.memberId}`}
                          candidate={candidate}
                          minRelic={unit.requirement.minRelic}
                          onAssign={() => void handleAssign(candidate.memberId)}
                          assigning={assigning}
                        />
                      ))}
                    </>
                  )}

                  {unit.nearMissPlayers.length > 0 && (
                    <>
                      <div className="border-b border-gray-700 bg-yellow-900/20 px-3 py-1.5 text-xs font-semibold text-yellow-400">
                        Near miss
                      </div>
                      {unit.nearMissPlayers.map((candidate) => (
                        <CandidateRow
                          key={`${candidate.allyCode}-${candidate.memberId}`}
                          candidate={candidate}
                          minRelic={unit.requirement.minRelic}
                          onAssign={() => void handleAssign(candidate.memberId)}
                          assigning={assigning}
                          isNearMiss
                        />
                      ))}
                    </>
                  )}

                  {unit.qualifiedPlayers.length === 0 && unit.nearMissPlayers.length === 0 && (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">
                      No guild member owns this unit
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm font-medium text-emerald-400">Filled</span>
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
    <div className="flex items-center justify-between border-b border-gray-700/50 px-3 py-2 transition-colors last:border-b-0 hover:bg-gray-700/50">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{candidate.playerName}</span>
          {candidate.isAlreadyAssignedElsewhere && (
            <span
              className="rounded border border-orange-700 bg-orange-900/50 px-1.5 py-0.5 text-[10px] text-orange-300"
              title="Already assigned elsewhere in this phase"
            >
              BUSY
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className={`text-xs font-mono ${
              candidate.relicTier >= minRelic ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            R{candidate.relicTier}
          </span>
          {candidate.relicDeficit > 0 && (
            <span className="text-[10px] text-red-400">
              missing {candidate.relicDeficit}
            </span>
          )}
          {candidate.rarityDeficit > 0 && (
            <span className="text-[10px] text-red-400">
              missing {candidate.rarityDeficit} star
              {candidate.rarityDeficit === 1 ? '' : 's'}
            </span>
          )}
          {candidate.assignmentCount > 0 && (
            <span className="text-[10px] text-gray-500">
              {candidate.assignmentCount} assignments
            </span>
          )}
        </div>
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onAssign();
        }}
        disabled={assigning || isNearMiss}
        className={`rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          isNearMiss
            ? 'bg-yellow-700 text-yellow-100 hover:bg-yellow-600'
            : 'bg-emerald-700 text-emerald-100 hover:bg-emerald-600'
        }`}
      >
        {isNearMiss ? 'Needs upgrades' : assigning ? '...' : 'Assign'}
      </button>
    </div>
  );
}
