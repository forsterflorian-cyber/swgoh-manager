'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { PhaseNavigation } from '@/components/tb/PhaseNavigation';
import { ZoneCard } from '@/components/tb/ZoneCard';
import type { GapAnalysisUnit, ZoneGapSummary } from '@/lib/types/tb';
import { toNumber } from '@/lib/utils/to-number';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type PhaseOverview = {
  totalSlots: number;
  filledSlots: number;
  openSlots: number;
  unresolvedGaps: number;
  completeZones: number;
  blockedZones: number;
  totalZones: number;
};

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
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalysis = async () => {
    await loadAnalysis(instanceId, phase, setZones, setLoading, setError);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalysis();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!isValidPhase) {
      return;
    }

    void loadAnalysis(instanceId, phase, setZones, setLoading, setError);
  }, [instanceId, isValidPhase, phase]);

  const overview = getPhaseOverview(zones);
  const totalPhases = zones[0]?.totalPhases ?? 6;
  const tbName = zones[0]?.tbName ?? 'Territory Battle';
  const showBlockingLoader = loading && zones.length === 0;
  const blockedSlotCount = countUnitsWithStatus(zones, 'critical');
  const readySlotCount = countUnitsWithStatus(zones, 'partial');
  const emptySlotCount = countUnitsWithStatus(zones, 'empty');

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
                Territory Battle Planner
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {tbName}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <HeaderPill label={`Phase ${phase}`} tone="neutral" />
                <HeaderPill
                  label={`${overview.totalZones} zone${overview.totalZones === 1 ? '' : 's'}`}
                  tone="neutral"
                />
                <HeaderPill
                  label={`${overview.completeZones} complete`}
                  tone={overview.completeZones > 0 ? 'positive' : 'neutral'}
                />
                <HeaderPill
                  label={`${overview.blockedZones} blocked`}
                  tone={overview.blockedZones > 0 ? 'danger' : 'neutral'}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {refreshing && (
                <span className="text-sm text-blue-200">Refreshing latest analysis...</span>
              )}
              <button
                onClick={() => void handleRefresh()}
                disabled={!isValidPhase || refreshing}
                className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
              >
                {refreshing ? 'Refreshing...' : 'Refresh analysis'}
              </button>
            </div>
          </div>

          <PhaseNavigation
            instanceId={instanceId}
            currentPhase={phase}
            totalPhases={totalPhases}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {!isValidPhase && (
          <PageMessage
            tone="danger"
            title="Invalid phase"
            description="Open a valid Territory Battle phase to load the planner."
          />
        )}

        {isValidPhase && error && !showBlockingLoader && (
          <PageMessage
            tone="danger"
            title="Analysis could not be refreshed"
            description={error}
          />
        )}

        {!isValidPhase ? null : showBlockingLoader ? (
          <PageMessage
            tone="neutral"
            title="Loading phase analysis"
            description="Reading saved Territory Battle reference data and current roster state."
            loading
          />
        ) : zones.length === 0 ? (
          <PageMessage
            tone="neutral"
            title={`No reference data for phase ${phase}`}
            description="Import the current Territory Battle reference data first, then reload this planner page."
          />
        ) : (
          <>
            <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label="Total slots"
                value={overview.totalSlots}
                detail={`${overview.totalZones} zone${overview.totalZones === 1 ? '' : 's'} in this phase`}
                tone="neutral"
              />
              <SummaryCard
                label="Filled slots"
                value={overview.filledSlots}
                detail={`${Math.round(
                  overview.totalSlots === 0
                    ? 0
                    : (overview.filledSlots / overview.totalSlots) * 100
                )}% assigned`}
                tone="positive"
              />
              <SummaryCard
                label="Open slots"
                value={overview.openSlots}
                detail="Still waiting for assignments"
                tone="neutral"
              />
              <SummaryCard
                label="Unresolved gaps"
                value={overview.unresolvedGaps}
                detail="Slots with no valid assignment yet"
                tone={overview.unresolvedGaps > 0 ? 'danger' : 'positive'}
              />
              <SummaryCard
                label="Complete zones"
                value={overview.completeZones}
                detail={`${overview.blockedZones} blocked zone${
                  overview.blockedZones === 1 ? '' : 's'
                }`}
                tone={overview.completeZones > 0 ? 'info' : 'neutral'}
              />
            </section>

            <section className="mb-6 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Phase focus</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Start with blocked zones, then close the remaining open slots in partial
                    zones.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <HeaderPill
                    label={`${blockedSlotCount} blocked slots`}
                    tone={blockedSlotCount > 0 ? 'danger' : 'neutral'}
                  />
                  <HeaderPill
                    label={`${readySlotCount} ready-to-fill slots`}
                    tone={readySlotCount > 0 ? 'warning' : 'neutral'}
                  />
                  <HeaderPill
                    label={`${emptySlotCount} empty slots`}
                    tone={emptySlotCount > 0 ? 'neutral' : 'positive'}
                  />
                </div>
              </div>
            </section>

            <ZoneSection
              zones={zones.filter((z) => !z.isBonus)}
              instanceId={instanceId}
              onAssignmentChange={fetchAnalysis}
            />
            {zones.some((z) => z.isBonus) && (
              <ZoneSection
                title="Bonus zones"
                zones={zones.filter((z) => z.isBonus)}
                instanceId={instanceId}
                onAssignmentChange={fetchAnalysis}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ZoneSection({
  title,
  zones,
  instanceId,
  onAssignmentChange,
}: {
  title?: string;
  zones: ZoneGapSummary[];
  instanceId: string;
  onAssignmentChange: () => void;
}) {
  if (zones.length === 0) return null;
  return (
    <div className="space-y-5">
      {title && (
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-300">{title}</h2>
          <span className="rounded-full border border-amber-800 bg-amber-950/60 px-2 py-0.5 text-xs font-medium text-amber-200">
            Bonus
          </span>
        </div>
      )}
      {zones.map((zone) => (
        <ZoneCard
          key={zone.zoneKey}
          zone={zone}
          instanceId={instanceId}
          onAssignmentChange={onAssignmentChange}
        />
      ))}
    </div>
  );
}

function getPhaseOverview(zones: ZoneGapSummary[]): PhaseOverview {
  const overview = zones.reduce<PhaseOverview>(
    (overview, zone) => {
      const zoneIsComplete = zone.totalSlots > 0 && zone.gapSlots === 0;
      const zoneIsBlocked = zone.units.some((unit) => unit.status === 'critical');

      overview.totalSlots += zone.totalSlots;
      overview.filledSlots += zone.filledSlots;
      overview.unresolvedGaps += zone.gapSlots;
      overview.totalZones += 1;
      overview.completeZones += zoneIsComplete ? 1 : 0;
      overview.blockedZones += zoneIsBlocked ? 1 : 0;

      return overview;
    },
    {
      totalSlots: 0,
      filledSlots: 0,
      openSlots: 0,
      unresolvedGaps: 0,
      completeZones: 0,
      blockedZones: 0,
      totalZones: 0,
    }
  );

  overview.openSlots = Math.max(overview.totalSlots - overview.filledSlots, 0);

  return overview;
}

function countUnitsWithStatus(
  zones: ZoneGapSummary[],
  status: GapAnalysisUnit['status']
): number {
  return zones.reduce(
    (count, zone) => count + zone.units.filter((unit) => unit.status === status).length,
    0
  );
}

function HeaderPill({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
}) {
  const toneClasses = {
    neutral: 'border-gray-800 bg-gray-900 text-gray-300',
    positive: 'border-emerald-800 bg-emerald-950/60 text-emerald-200',
    warning: 'border-amber-800 bg-amber-950/60 text-amber-200',
    danger: 'border-red-900 bg-red-950/60 text-red-200',
    info: 'border-blue-800 bg-blue-950/60 text-blue-200',
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-sm ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}

function PageMessage({
  title,
  description,
  tone,
  loading = false,
}: {
  title: string;
  description: string;
  tone: 'danger' | 'neutral';
  loading?: boolean;
}) {
  const toneClasses = {
    danger: 'border-red-900 bg-red-950/40 text-red-100',
    neutral: 'border-gray-800 bg-gray-900/70 text-gray-100',
  };

  return (
    <div className={`mb-6 rounded-2xl border p-5 ${toneClasses[tone]}`}>
      <div className="flex items-start gap-4">
        {loading && (
          <div className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        )}
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-gray-300">{description}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: 'neutral' | 'positive' | 'danger' | 'info';
}) {
  const toneClasses = {
    neutral: 'border-gray-800 bg-gray-900/70',
    positive: 'border-emerald-900 bg-emerald-950/40',
    danger: 'border-red-900 bg-red-950/40',
    info: 'border-blue-900 bg-blue-950/40',
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{detail}</p>
    </div>
  );
}
