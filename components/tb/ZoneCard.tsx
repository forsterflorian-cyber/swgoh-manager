'use client';

import { useState } from 'react';

import type { GapAnalysisUnit, ZoneGapSummary } from '@/lib/types/tb';
import { UnitSlotRow } from './UnitSlotRow';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type ZoneState = 'complete' | 'partial' | 'critical' | 'empty';

interface Props {
  zone: ZoneGapSummary;
  instanceId: string;
  onAssignmentChange: () => void;
}

export function ZoneCard({ zone, instanceId, onAssignmentChange }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [autoAssigning, setAutoAssigning] = useState(false);

  const zoneState = getZoneState(zone);
  const platoonSummary = getPlatoonSummary(zone.units);
  const blockedSlots = zone.units.filter((unit) => unit.status === 'critical').length;
  const readyToFillSlots = Math.max(zone.readySlots - zone.filledSlots, 0);

  const handleAutoAssign = async () => {
    if (
      !confirm(
        `Auto assign for "${zone.zoneName}"? This fills open platoon slots with the best available guild members.`
      )
    ) {
      return;
    }

    setAutoAssigning(true);

    try {
      const res = await fetch(`/api/tb/${instanceId}/auto-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: zone.phase,
          zoneKey: zone.zoneKey,
        }),
      });

      const data = (await res.json()) as ApiEnvelope<{
        assigned: number;
        skipped: number;
        errors: string[];
      }>;

      if (res.ok && data.ok) {
        alert(`Assigned ${data.data.assigned} slots, skipped ${data.data.skipped}`);
        onAssignmentChange();
      } else {
        alert(`Error: ${data.ok ? 'Auto assign failed' : data.error}`);
      }
    } catch {
      alert('Auto assign failed');
    } finally {
      setAutoAssigning(false);
    }
  };

  const progressColor = getProgressColor(zoneState, zone.completionPercent);
  const cardTone = getZoneTone(zoneState);

  return (
    <section className={`overflow-hidden rounded-2xl border ${cardTone.border} ${cardTone.bg}`}>
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={cardTone.label} className={cardTone.badge} />
              {zone.gapSlots > 0 && (
                <StatusBadge
                  label={`${zone.gapSlots} open`}
                  className="border-red-900 bg-red-950/70 text-red-200"
                />
              )}
              {blockedSlots > 0 && (
                <StatusBadge
                  label={`${blockedSlots} blocked`}
                  className="border-amber-900 bg-amber-950/70 text-amber-200"
                />
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold tracking-tight text-white">
                  {zone.zoneName}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  {zone.filledSlots} of {zone.totalSlots} slots assigned across{' '}
                  {platoonSummary.total} platoon{platoonSummary.total === 1 ? '' : 's'}
                </p>
              </div>
              <p className="text-sm font-medium text-gray-300">
                {zone.completionPercent}% complete
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ZoneMetric
                label="Slots"
                value={`${zone.filledSlots}/${zone.totalSlots}`}
                detail={zone.gapSlots === 0 ? 'All covered' : `${zone.gapSlots} unresolved`}
              />
              <ZoneMetric
                label="Platoons"
                value={`${platoonSummary.complete}/${platoonSummary.total}`}
                detail={
                  platoonSummary.complete === platoonSummary.total
                    ? 'All complete'
                    : `${platoonSummary.total - platoonSummary.complete} still open`
                }
              />
              <ZoneMetric
                label="Candidates"
                value={`${readyToFillSlots}`}
                detail={
                  readyToFillSlots > 0
                    ? 'Ready-to-fill slots'
                    : 'No extra ready slots'
                }
              />
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                style={{ width: `${zone.completionPercent}%` }}
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 xl:w-auto xl:flex-col xl:items-stretch">
            {zone.gapSlots > 0 && (
              <button
                onClick={() => void handleAutoAssign()}
                disabled={autoAssigning}
                className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
              >
                {autoAssigning ? 'Assigning...' : 'Auto fill zone'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-700 hover:bg-gray-900"
            >
              {expanded ? 'Hide slot details' : 'Show slot details'}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 bg-gray-950/50">
          <div className="border-b border-gray-800/80 px-4 py-3 text-sm text-gray-400 sm:px-5">
            Review unresolved slots first, then confirm the remaining ready candidates.
          </div>
          <div className="divide-y divide-gray-800/80">
            {zone.units.map((unit) => (
              <UnitSlotRow
                key={unit.requirement.tbPlatoonSlotId}
                unit={unit}
                instanceId={instanceId}
                onAssignmentChange={onAssignmentChange}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function getZoneState(zone: ZoneGapSummary): ZoneState {
  if (zone.totalSlots === 0) {
    return 'empty';
  }

  if (zone.gapSlots === 0) {
    return 'complete';
  }

  if (zone.units.some((unit) => unit.status === 'critical')) {
    return 'critical';
  }

  if (zone.filledSlots > 0 || zone.readySlots > 0) {
    return 'partial';
  }

  return 'empty';
}

function getPlatoonSummary(units: GapAnalysisUnit[]) {
  const platoons = new Map<number, GapAnalysisUnit[]>();

  for (const unit of units) {
    const platoonNumber = unit.requirement.platoonNumber;
    const group = platoons.get(platoonNumber);

    if (group) {
      group.push(unit);
    } else {
      platoons.set(platoonNumber, [unit]);
    }
  }

  const total = platoons.size;
  let complete = 0;

  for (const group of platoons.values()) {
    if (group.every((unit) => unit.gapCount === 0)) {
      complete += 1;
    }
  }

  return { total, complete };
}

function getZoneTone(zoneState: ZoneState) {
  switch (zoneState) {
    case 'complete':
      return {
        label: 'Complete',
        border: 'border-emerald-900',
        bg: 'bg-emerald-950/20',
        badge: 'border-emerald-900 bg-emerald-950/70 text-emerald-200',
      };
    case 'critical':
      return {
        label: 'Blocked',
        border: 'border-red-900',
        bg: 'bg-red-950/20',
        badge: 'border-red-900 bg-red-950/70 text-red-200',
      };
    case 'partial':
      return {
        label: 'Partial',
        border: 'border-amber-900',
        bg: 'bg-amber-950/20',
        badge: 'border-amber-900 bg-amber-950/70 text-amber-200',
      };
    case 'empty':
    default:
      return {
        label: 'Empty',
        border: 'border-gray-800',
        bg: 'bg-gray-900/70',
        badge: 'border-gray-800 bg-gray-950/70 text-gray-300',
      };
  }
}

function getProgressColor(zoneState: ZoneState, percent: number) {
  if (zoneState === 'complete') {
    return 'bg-emerald-500';
  }

  if (zoneState === 'critical') {
    return 'bg-red-500';
  }

  if (zoneState === 'partial') {
    return percent >= 50 ? 'bg-amber-400' : 'bg-orange-500';
  }

  return 'bg-gray-600';
}

function StatusBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return <span className={`rounded-full border px-3 py-1 text-sm ${className}`}>{label}</span>;
}

function ZoneMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  );
}
