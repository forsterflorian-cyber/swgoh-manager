// app/tb/[instanceId]/phase/[phase]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ZoneGapSummary } from '@/lib/types/tb';
import { ZoneCard } from '@/components/tb/ZoneCard';
import { PhaseNavigation } from '@/components/tb/PhaseNavigation';

export default function PhaseDashboardPage() {
  const params = useParams();
  const instanceId = params.instanceId as string;
  const phase = parseInt(params.phase as string);

  const [zones, setZones] = useState<ZoneGapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tb/${instanceId}/gap?phase=${phase}`);
      const json = await res.json();
      if (json.success) {
        setZones(json.data);
      }
    } catch (error) {
      console.error('Failed to fetch gap analysis:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAnalysis();
  }, [instanceId, phase]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                {zones[0]?.tbName || 'Territory Battle'}
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Phase {phase} – Gap Analysis
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchAnalysis}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg
                           text-sm transition-colors"
              >
                ↻ Refresh
              </button>
              <button
                onClick={async () => {
                  setSyncing(true);
                  // Trigger roster sync
                  setSyncing(false);
                  fetchAnalysis();
                }}
                disabled={syncing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg
                           text-sm transition-colors disabled:opacity-50"
              >
                {syncing ? '⟳ Syncing...' : '☁ Sync Roster'}
              </button>
            </div>
          </div>

          <PhaseNavigation
            instanceId={instanceId}
            currentPhase={phase}
            totalPhases={6}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500
                            border-t-transparent rounded-full" />
            <span className="ml-3 text-gray-400">Analyzing roster data...</span>
          </div>
        ) : zones.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-xl">No requirements found for Phase {phase}</p>
            <p className="mt-2">Make sure TB requirements are configured.</p>
          </div>
        ) : (
          <>
            {/* Summary Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <SummaryCard
                label="Total Slots"
                value={zones.reduce((s, z) => s + z.totalSlots, 0)}
                color="gray"
              />
              <SummaryCard
                label="Filled"
                value={zones.reduce((s, z) => s + z.filledSlots, 0)}
                color="green"
              />
              <SummaryCard
                label="Ready (Unassigned)"
                value={zones.reduce((s, z) => s + z.readySlots - z.filledSlots, 0)}
                color="blue"
              />
              <SummaryCard
                label="Gaps"
                value={zones.reduce((s, z) => s + z.gapSlots, 0)}
                color="red"
              />
            </div>

            {/* Zone Cards */}
            <div className="space-y-6">
              {zones.map((zone) => (
                <ZoneCard
                  key={zone.zoneCode}
                  zone={zone}
                  instanceId={instanceId}
                  onAssignmentChange={fetchAnalysis}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'gray' | 'green' | 'blue' | 'red';
}) {
  const colors = {
    gray: 'bg-gray-800 border-gray-700',
    green: 'bg-emerald-900/30 border-emerald-700',
    blue: 'bg-blue-900/30 border-blue-700',
    red: 'bg-red-900/30 border-red-700',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}