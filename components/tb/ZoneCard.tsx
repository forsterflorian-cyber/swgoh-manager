'use client';

import { useState } from 'react';

import type { ZoneGapSummary } from '@/lib/types/tb';
import { UnitSlotRow } from './UnitSlotRow';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

interface Props {
  zone: ZoneGapSummary;
  instanceId: string;
  onAssignmentChange: () => void;
}

export function ZoneCard({ zone, instanceId, onAssignmentChange }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [autoAssigning, setAutoAssigning] = useState(false);

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

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return 'bg-emerald-500';
    if (percent >= 75) return 'bg-blue-500';
    if (percent >= 50) return 'bg-yellow-500';
    if (percent >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      <div
        className="cursor-pointer p-4 transition-colors hover:bg-gray-800/50"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">{expanded ? 'v' : '>'}</span>
            <div>
              <h3 className="text-lg font-semibold">{zone.zoneName}</h3>
              <p className="text-sm text-gray-400">
                {zone.filledSlots}/{zone.totalSlots} slots assigned
                {zone.gapSlots > 0 && (
                  <span className="ml-2 text-red-400">({zone.gapSlots} open)</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                zone.completionPercent >= 100
                  ? 'border border-emerald-700 bg-emerald-900/50 text-emerald-300'
                  : zone.completionPercent >= 50
                    ? 'border border-yellow-700 bg-yellow-900/50 text-yellow-300'
                    : 'border border-red-700 bg-red-900/50 text-red-300'
              }`}
            >
              {zone.completionPercent}%
            </div>

            {zone.gapSlots > 0 && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void handleAutoAssign();
                }}
                disabled={autoAssigning}
                className="rounded-lg bg-blue-600 px-3 py-1 text-sm transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {autoAssigning ? 'Assigning...' : 'Auto Fill'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getProgressColor(zone.completionPercent)}`}
            style={{ width: `${zone.completionPercent}%` }}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800">
          <div className="grid grid-cols-12 gap-2 bg-gray-800/50 px-4 py-2 text-xs uppercase tracking-wider text-gray-400">
            <div className="col-span-1">Status</div>
            <div className="col-span-3">Unit</div>
            <div className="col-span-1">Req</div>
            <div className="col-span-3">Assigned</div>
            <div className="col-span-4">Action</div>
          </div>

          {zone.units.map((unit) => (
            <UnitSlotRow
              key={unit.requirement.tbPlatoonSlotId}
              unit={unit}
              instanceId={instanceId}
              onAssignmentChange={onAssignmentChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
