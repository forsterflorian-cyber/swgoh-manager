'use client';

import { useState } from 'react';

import type { AssignedPlayer, GapAnalysisUnit, PlayerCandidate } from '@/lib/types/tb';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type RowState = 'complete' | 'partial' | 'critical' | 'empty' | 'conflict' | 'invalid';
type RequirementBadge = {
  label: string;
  className: string;
};

interface Props {
  unit: GapAnalysisUnit;
  instanceId: string;
  onAssignmentChange: () => void;
}

export function UnitSlotRow({ unit, instanceId, onAssignmentChange }: Props) {
  const [assigning, setAssigning] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rowState = getRowState(unit);
  const rowTone = getRowTone(rowState);
  const requirements = getRequirementBadges(unit);

  const handleAssign = async (memberId: string) => {
    setAssigning(true);
    setActionError(null);

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
        setShowCandidates(false);
        onAssignmentChange();
        return;
      }

      setActionError(data.ok ? 'Assignment failed' : data.error);
    } catch {
      setActionError('Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    if (!confirm('Remove this assignment?')) {
      return;
    }

    setActionError(null);

    try {
      const res = await fetch(`/api/tb/${instanceId}/assign`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });

      const data = (await res.json()) as ApiEnvelope<{ removed: true }>;

      if (res.ok && data.ok) {
        onAssignmentChange();
        return;
      }

      setActionError(data.ok ? 'Unassign failed' : data.error);
    } catch {
      setActionError('Unassign failed');
    }
  };

  return (
    <div className={`border-l-4 ${rowTone.border} bg-gray-950/20`}>
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge label={rowTone.label} className={rowTone.badge} />
              <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300">
                Platoon {unit.requirement.platoonNumber}, slot {unit.requirement.slotNumber}
              </span>
              {unit.gapCount > 0 && (
                <span className="rounded-full border border-red-900 bg-red-950/70 px-3 py-1 text-xs text-red-200">
                  {unit.gapCount} open
                </span>
              )}
            </div>

            <div className="mt-3">
              <h3 className="text-lg font-semibold text-white">
                {unit.requirement.unitName || unit.requirement.unitBaseId}
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                Base ID: <span className="font-mono text-gray-300">{unit.requirement.unitBaseId}</span>
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {requirements.map((requirement) => (
                <span
                  key={requirement.label}
                  className={`rounded-full border px-3 py-1 text-xs ${requirement.className}`}
                >
                  {requirement.label}
                </span>
              ))}
              <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300">
                {unit.qualifiedPlayers.length} ready
              </span>
              {unit.nearMissPlayers.length > 0 && (
                <span className="rounded-full border border-amber-900 bg-amber-950/70 px-3 py-1 text-xs text-amber-200">
                  {unit.nearMissPlayers.length} near miss
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 xl:w-[40rem] xl:grid-cols-[minmax(0,1fr)_minmax(16rem,18rem)]">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Assignment
              </p>

              {unit.assignedPlayers.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {unit.assignedPlayers.map((player) => (
                    <AssignedPlayerCard
                      key={player.assignmentId}
                      player={player}
                      minRelic={unit.requirement.minRelic}
                      onUnassign={() => void handleUnassign(player.assignmentId)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-400">
                    No member assigned yet. Review candidates on the right to fill this slot.
                  </p>
                  {unit.openReason === 'no_eligible_member' && (
                    <span className="inline-block rounded-full border border-red-900 bg-red-950/70 px-2 py-0.5 text-[11px] text-red-200">
                      No eligible member
                    </span>
                  )}
                  {unit.openReason === 'eligible_at_capacity' && (
                    <span className="inline-block rounded-full border border-amber-900 bg-amber-950/70 px-2 py-0.5 text-[11px] text-amber-200">
                      All qualified at cap
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Next action
                  </p>
                  <p className="mt-2 text-sm text-gray-300">{getActionSummary(unit, rowState)}</p>
                </div>
                {unit.gapCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCandidates((value) => !value)}
                    className="rounded-xl border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-600 hover:bg-gray-900"
                  >
                    {showCandidates ? 'Hide' : 'Review'}
                  </button>
                )}
              </div>

              {unit.gapCount === 0 ? (
                <div className="mt-3 rounded-xl border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                  Slot covered. Remove an assignment only if you need to rebalance the phase.
                </div>
              ) : showCandidates ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-gray-800 bg-gray-950/70">
                  {unit.qualifiedPlayers.length > 0 && (
                    <>
                      <div className="border-b border-gray-800 bg-emerald-950/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                        Ready candidates
                      </div>
                      {unit.qualifiedPlayers.map((candidate) => (
                        <CandidateRow
                          key={`${candidate.allyCode}-${candidate.memberId}`}
                          candidate={candidate}
                          minRelic={unit.requirement.minRelic}
                          minRarity={unit.requirement.minRarity}
                          onAssign={() => void handleAssign(candidate.memberId)}
                          assigning={assigning}
                        />
                      ))}
                    </>
                  )}

                  {unit.nearMissPlayers.length > 0 && (
                    <>
                      <div className="border-b border-t border-gray-800 bg-amber-950/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
                        Near misses
                      </div>
                      {unit.nearMissPlayers.map((candidate) => (
                        <CandidateRow
                          key={`${candidate.allyCode}-${candidate.memberId}`}
                          candidate={candidate}
                          minRelic={unit.requirement.minRelic}
                          minRarity={unit.requirement.minRarity}
                          onAssign={() => void handleAssign(candidate.memberId)}
                          assigning={assigning}
                          isNearMiss
                        />
                      ))}
                    </>
                  )}

                  {unit.qualifiedPlayers.length === 0 && unit.nearMissPlayers.length === 0 && (
                    <div className="px-3 py-4 text-sm text-gray-400">
                      No guild member currently owns this unit at usable levels.
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-gray-800 bg-gray-950 px-3 py-1 text-xs text-gray-300">
                    {unit.qualifiedPlayers.length} ready
                  </span>
                  <span className="rounded-full border border-gray-800 bg-gray-950 px-3 py-1 text-xs text-gray-300">
                    {unit.nearMissPlayers.length} near miss
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {actionError}
          </div>
        )}
      </div>
    </div>
  );
}

function getRowState(unit: GapAnalysisUnit): RowState {
  const hasConflict = unit.assignedPlayers.some((player) => player.hasConflict);
  const hasInvalidRelic = unit.assignedPlayers.some(
    (player) => player.relicTier < unit.requirement.minRelic
  );

  if (hasConflict) {
    return 'conflict';
  }

  if (hasInvalidRelic) {
    return 'invalid';
  }

  return unit.status;
}

function getActionSummary(unit: GapAnalysisUnit, rowState: RowState) {
  if (rowState === 'conflict') {
    return 'This assignment conflicts with another slot in the same phase.';
  }

  if (rowState === 'invalid') {
    return 'Current assignment is below the required relic tier and should be replaced.';
  }

  if (unit.gapCount === 0) {
    return 'This slot is fully covered.';
  }

  if (unit.qualifiedPlayers.length > 0) {
    return 'Ready candidates are available for assignment.';
  }

  if (unit.nearMissPlayers.length > 0) {
    return 'Only near misses are available. This slot still needs upgrades.';
  }

  if (unit.openReason === 'eligible_at_capacity') {
    return 'Qualified members exist but all have reached the zone cap (10). Run auto-fill to rebalance.';
  }

  return 'No guild member currently owns this unit at the required level.';
}

function getRowTone(rowState: RowState) {
  switch (rowState) {
    case 'complete':
      return {
        label: 'Assigned',
        border: 'border-emerald-500',
        badge: 'border-emerald-900 bg-emerald-950/70 text-emerald-200',
      };
    case 'partial':
      return {
        label: 'Ready',
        border: 'border-amber-400',
        badge: 'border-amber-900 bg-amber-950/70 text-amber-200',
      };
    case 'critical':
      return {
        label: 'Blocked',
        border: 'border-red-500',
        badge: 'border-red-900 bg-red-950/70 text-red-200',
      };
    case 'empty':
      return {
        label: 'Open',
        border: 'border-gray-700',
        badge: 'border-gray-800 bg-gray-950/70 text-gray-300',
      };
    case 'conflict':
      return {
        label: 'Conflict',
        border: 'border-orange-500',
        badge: 'border-orange-900 bg-orange-950/70 text-orange-200',
      };
    case 'invalid':
    default:
      return {
        label: 'Invalid',
        border: 'border-rose-500',
        badge: 'border-rose-900 bg-rose-950/70 text-rose-200',
      };
  }
}

function getRequirementBadges(unit: GapAnalysisUnit) {
  const requirements: RequirementBadge[] = [];

  if (unit.requirement.minRarity > 0) {
    requirements.push({
      label: `${unit.requirement.minRarity}★ minimum`,
      className: 'border-indigo-900 bg-indigo-950/70 text-indigo-200',
    });
  }

  requirements.push({
    label: `R${unit.requirement.minRelic} minimum`,
    className: 'border-blue-900 bg-blue-950/70 text-blue-200',
  });

  return requirements;
}

function StateBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function AssignedPlayerCard({
  player,
  minRelic,
  onUnassign,
}: {
  player: AssignedPlayer;
  minRelic: number;
  onUnassign: () => void;
}) {
  const belowRequirement = player.relicTier < minRelic;

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/80 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-white">{player.playerName}</p>
          {player.hasConflict && (
            <span className="rounded-full border border-orange-900 bg-orange-950/70 px-2 py-0.5 text-[11px] text-orange-200">
              Conflict
            </span>
          )}
          {belowRequirement && (
            <span className="rounded-full border border-rose-900 bg-rose-950/70 px-2 py-0.5 text-[11px] text-rose-200">
              Below relic
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <span
            className={`rounded-full border px-2 py-0.5 ${
              belowRequirement
                ? 'border-rose-900 bg-rose-950/70 text-rose-200'
                : 'border-emerald-900 bg-emerald-950/70 text-emerald-200'
            }`}
          >
            R{player.relicTier}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 ${
              player.lockType === 'LOCKED'
                ? 'border-violet-800 bg-violet-950/70 text-violet-200'
                : 'border-gray-700 bg-gray-900 text-gray-400'
            }`}
          >
            {player.lockType === 'LOCKED' ? 'Locked' : 'Auto'}
          </span>
          <span className="font-mono text-gray-500">{player.allyCode}</span>
        </div>
      </div>

      <button
        onClick={onUnassign}
        className="shrink-0 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-950/80"
        title="Remove assignment"
      >
        Remove
      </button>
    </div>
  );
}

function CandidateRow({
  candidate,
  minRelic,
  minRarity,
  onAssign,
  assigning,
  isNearMiss = false,
}: {
  candidate: PlayerCandidate;
  minRelic: number;
  minRarity: number;
  onAssign: () => void;
  assigning: boolean;
  isNearMiss?: boolean;
}) {
  const relicOk = candidate.relicTier >= minRelic;
  const rarityOk = candidate.rarity >= minRarity;

  return (
    <div className="flex items-start justify-between gap-3 border-t border-gray-800 px-3 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-white">{candidate.playerName}</p>
          {candidate.isAlreadyAssignedElsewhere && (
            <span className="rounded-full border border-orange-900 bg-orange-950/70 px-2 py-0.5 text-[11px] text-orange-200">
              Busy
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <span
            className={`rounded-full border px-2 py-0.5 ${
              relicOk
                ? 'border-emerald-900 bg-emerald-950/70 text-emerald-200'
                : 'border-rose-900 bg-rose-950/70 text-rose-200'
            }`}
          >
            R{candidate.relicTier}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 ${
              rarityOk
                ? 'border-emerald-900 bg-emerald-950/70 text-emerald-200'
                : 'border-rose-900 bg-rose-950/70 text-rose-200'
            }`}
          >
            {candidate.rarity}★
          </span>
          {candidate.relicDeficit > 0 && (
            <span className="text-rose-300">needs +{candidate.relicDeficit} relic</span>
          )}
          {candidate.rarityDeficit > 0 && (
            <span className="text-rose-300">needs +{candidate.rarityDeficit} star</span>
          )}
          {candidate.assignmentCount > 0 && (
            <span className="text-gray-500">{candidate.assignmentCount} assignments</span>
          )}
        </div>
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onAssign();
        }}
        disabled={assigning || isNearMiss}
        className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isNearMiss
            ? 'border border-amber-800 bg-amber-950/50 text-amber-200 hover:bg-amber-950/80'
            : 'border border-emerald-800 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-950/80'
        }`}
      >
        {isNearMiss ? 'Upgrade needed' : assigning ? 'Assigning...' : 'Assign'}
      </button>
    </div>
  );
}

