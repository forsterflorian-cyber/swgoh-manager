// components/tb/ZoneCard.tsx

'use client';

import { useState } from 'react';
import { ZoneGapSummary, GapAnalysisUnit } from '@/lib/types/tb';
import { UnitSlotRow } from './UnitSlotRow';

interface Props {
  zone: ZoneGapSummary;
  instanceId: string;
  onAssignmentChange: () => void;
}

export function ZoneCard({ zone, instanceId, onAssignmentChange }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [autoAssigning, setAutoAssigning] = useState(false);

  const handleAutoAssign = async () => {
    if (!confirm(`Auto-Assign für "${zone.zoneName}" starten? Dies weist die besten verfügbaren Spieler automatisch zu.`)) {
      return;
    }

    setAutoAssigning(true);
    try {
      const res = await fetch(`/api/tb/${instanceId}/auto-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: zone.phase,
          zoneCode: zone.zoneCode,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`✓ ${data.data.assigned} Spieler zugewiesen, ${data.data.skipped} übersprungen`);
        onAssignmentChange();
      } else {
        alert(`Fehler: ${data.error}`);
      }
    } catch (error) {
      alert('Auto-Assign fehlgeschlagen');
    }
    setAutoAssigning(false);
  };

  // Farbe basierend auf Completion
  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'bg-emerald-500';
    if (pct >= 75) return 'bg-blue-500';
    if (pct >= 50) return 'bg-yellow-500';
    if (pct >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Zone Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">
              {expanded ? '▼' : '▶'}
            </span>
            <div>
              <h3 className="text-lg font-semibold">{zone.zoneName}</h3>
              <p className="text-sm text-gray-400">
                {zone.filledSlots}/{zone.totalSlots} Slots besetzt
                {zone.gapSlots > 0 && (
                  <span className="text-red-400 ml-2">
                    ({zone.gapSlots} offen)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Completion Badge */}
            <div className={`
              px-3 py-1 rounded-full text-sm font-bold
              ${zone.completionPercent >= 100
                ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                : zone.completionPercent >= 50
                  ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700'
                  : 'bg-red-900/50 text-red-300 border border-red-700'
              }
            `}>
              {zone.completionPercent}%
            </div>

            {/* Auto-Assign Button */}
            {zone.gapSlots > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAutoAssign();
                }}
                disabled={autoAssigning}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded-lg
                           text-sm transition-colors disabled:opacity-50"
              >
                {autoAssigning ? '⟳ ...' : '⚡ Auto-Fill'}
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getProgressColor(zone.completionPercent)}`}
            style={{ width: `${zone.completionPercent}%` }}
          />
        </div>
      </div>

      {/* Expanded: Unit List */}
      {expanded && (
        <div className="border-t border-gray-800">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-800/50 text-xs text-gray-400 uppercase tracking-wider">
            <div className="col-span-1">Status</div>
            <div className="col-span-3">Unit</div>
            <div className="col-span-1">Req</div>
            <div className="col-span-3">Zugewiesen</div>
            <div className="col-span-4">Aktion</div>
          </div>

          {/* Unit Rows */}
          {zone.units.map((unit) => (
            <UnitSlotRow
              key={unit.requirement.requirementId}
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