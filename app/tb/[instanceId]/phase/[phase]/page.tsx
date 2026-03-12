'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { PhaseNavigation } from '@/components/tb/PhaseNavigation';
import { ZoneCard } from '@/components/tb/ZoneCard';
import type { ZoneGapSummary } from '@/lib/types/tb';
import { toNumber } from '@/lib/utils/to-number';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function loadAnalysis(
  instanceId: string,
  phase: number,
  setZones: (zones: ZoneGapSummary[]) => void,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void
) {
  setLoading(true);
  try {
    const res = await fetch(`/api/tb/${instanceId}/gap?phase=${phase}`);
    const json = (await res.json()) as ApiEnvelope<ZoneGapSummary[]>;

    if (!res.ok || !json.ok) {
      throw new Error(json.ok ? 'Gap analysis failed' : json.error);
    }

    setZones(json.data);
    setError(null);
  } catch (error: unknown) {
    setZones([]);
    setError(error instanceof Error ? error.message : 'Failed to fetch gap analysis');
  } finally {
    setLoading(false);
  }
}

export default function PhaseDashboardPage() {
  const params = useParams();
  const instanceId = params.instanceId as string;
  const phase = toNumber(params.phase, 0);
  const isValidPhase = Boolean(instanceId) && phase >= 1;

  const [zones, setZones] = useState<ZoneGapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchAnalysis = async () => {
    await loadAnalysis(instanceId, phase, setZones, setLoading, setError);
  };

  useEffect(() => {
    if (!isValidPhase) {
      return;
    }

    void loadAnalysis(instanceId, phase, setZones, setLoading, setError);
  }, [instanceId, isValidPhase, phase]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{zones[0]?.tbName || 'Territory Battle'}</h1>
              <p className="mt-1 text-sm text-gray-400">Phase {phase} gap analysis</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void fetchAnalysis()}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm transition-colors hover:bg-gray-700"
              >
                Refresh
              </button>
              <button
                onClick={async () => {
                  setSyncing(true);
                  await fetchAnalysis();
                  setSyncing(false);
                }}
                disabled={syncing}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {syncing ? 'Refreshing...' : 'Refresh Analysis'}
              </button>
            </div>
          </div>

          <PhaseNavigation
            instanceId={instanceId}
            currentPhase={phase}
            totalPhases={zones[0]?.totalPhases || 6}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {!isValidPhase && (
          <div className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-200">
            Invalid Territory Battle phase
          </div>
        )}

        {isValidPhase && error && !loading && (
          <div className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-200">
            {error}
          </div>
        )}

        {!isValidPhase ? null : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="ml-3 text-gray-400">Analyzing roster data...</span>
          </div>
        ) : zones.length === 0 ? (
          <div className="py-20 text-center text-gray-500">
            <p className="text-xl">No reference data found for phase {phase}</p>
            <p className="mt-2">Import the current territory battle reference data first.</p>
          </div>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              <SummaryCard
                label="Total Slots"
                value={zones.reduce((sum, zone) => sum + zone.totalSlots, 0)}
                color="gray"
              />
              <SummaryCard
                label="Filled"
                value={zones.reduce((sum, zone) => sum + zone.filledSlots, 0)}
                color="green"
              />
              <SummaryCard
                label="Ready"
                value={zones.reduce((sum, zone) => sum + zone.readySlots - zone.filledSlots, 0)}
                color="blue"
              />
              <SummaryCard
                label="Gaps"
                value={zones.reduce((sum, zone) => sum + zone.gapSlots, 0)}
                color="red"
              />
            </div>

            <div className="space-y-6">
              {zones.map((zone) => (
                <ZoneCard
                  key={zone.zoneKey}
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
    gray: 'border-gray-700 bg-gray-800',
    green: 'border-emerald-700 bg-emerald-900/30',
    blue: 'border-blue-700 bg-blue-900/30',
    red: 'border-red-700 bg-red-900/30',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
