'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type DashboardGuild = {
  id: string;
  name: string;
  slug: string | null;
  swgoh_gg_id: string | null;
  memberCount: number;
  rosteredMembers: number;
};

type DashboardTb = {
  id: string;
  name: string;
  status: string;
};

type DashboardStrategicReadiness = {
  reference: {
    name: string;
    tbKey: string;
  } | null;
  summary: {
    totalZones: number;
    totalPlatoons: number;
    totalSlots: number;
    coverableSlots: number;
    missingSlots: number;
    coveragePercent: number;
    estimatedCoverablePlatoons: number;
    blockedPlatoons: number;
    blockedZones: number;
    bottleneckUnitCount: number;
  } | null;
  topMissingUnits: Array<{
    unitName: string;
    missingSlots: number;
    blockedZones: number;
    nearMissOwners: number;
  }>;
  zones: Array<{
    phase: number;
    zoneName: string;
    missingSlots: number;
    status: 'ready' | 'partial' | 'blocked';
    estimatedCoverablePlatoons: number;
    totalPlatoons: number;
    blockers: string[];
  }>;
  recommendedActions: string[];
  dataState: {
    hasGuild: boolean;
    hasRosterData: boolean;
    hasReferenceData: boolean;
    isFixture: boolean;
    rosterCoverageRatio: number;
  };
};

type DashboardData = {
  guild: DashboardGuild | null;
  activeTb: DashboardTb | null;
  lastRosterSync: string | null;
  strategicReadiness: DashboardStrategicReadiness | null;
};

type GuildMemberSummary = {
  ally_code: string;
  player_name: string;
};

type SyncStatus = {
  current: number;
  total: number;
  msg: string;
};

type Notice = {
  tone: 'success' | 'error';
  message: string;
};

export default function DashboardPage() {
  const [guild, setGuild] = useState<DashboardGuild | null>(null);
  const [activeTb, setActiveTb] = useState<DashboardTb | null>(null);
  const [lastRosterSync, setLastRosterSync] = useState<string | null>(null);
  const [strategicReadiness, setStrategicReadiness] =
    useState<DashboardStrategicReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const dashboard = await fetchDashboard();
        setGuild(dashboard.guild);
        setActiveTb(dashboard.activeTb);
        setLastRosterSync(dashboard.lastRosterSync);
        setStrategicReadiness(dashboard.strategicReadiness);
        setError(null);
      } catch (loadError: unknown) {
        setError(loadError instanceof Error ? loadError.message : 'Dashboard could not be loaded');
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  const handleSync = async () => {
    if (!guild?.id) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      setSyncStatus({ current: 0, total: 0, msg: 'Initializing guild sync...' });

      const initRes = await fetch(`/api/guild/${guild.id}/sync`, { method: 'POST' });
      const initData = (await initRes.json()) as ApiEnvelope<{ imported: number; total: number }>;

      if (!initRes.ok || !initData.ok) {
        throw new Error(initData.ok ? 'Guild import failed.' : initData.error);
      }

      const membersRes = await fetch(`/api/guild/${guild.id}/members`);
      const membersData = (await membersRes.json()) as ApiEnvelope<{
        members: GuildMemberSummary[];
      }>;

      if (!membersRes.ok || !membersData.ok) {
        throw new Error(membersData.ok ? 'Members could not be loaded.' : membersData.error);
      }

      const members = membersData.data.members;
      if (members.length === 0) {
        throw new Error('No guild members found.');
      }

      setSyncStatus({
        current: 0,
        total: members.length,
        msg: 'Starting roster sync...',
      });

      let count = 0;
      for (const member of members) {
        count += 1;
        setSyncStatus({
          current: count,
          total: members.length,
          msg: `Syncing ${member.player_name}...`,
        });

        const response = await fetch(`/api/guild/${guild.id}/sync?allyCode=${member.ally_code}`, {
          method: 'POST',
        });
        const payload = (await response.json()) as ApiEnvelope<{ syncedUnits: number }>;

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.ok ? `Roster sync failed for ${member.player_name}.` : payload.error
          );
        }
      }

      setSyncStatus({
        current: members.length,
        total: members.length,
        msg: 'Roster sync completed.',
      });

      const dashboard = await fetchDashboard();
      setGuild(dashboard.guild);
      setActiveTb(dashboard.activeTb);
      setLastRosterSync(dashboard.lastRosterSync);
      setStrategicReadiness(dashboard.strategicReadiness);
      setNotice({
        tone: 'success',
        message: 'Roster sync completed successfully.',
      });

      window.setTimeout(() => setSyncStatus(null), 2500);
    } catch (syncError: unknown) {
      const message =
        syncError instanceof Error ? syncError.message : 'Roster synchronization failed.';

      setNotice({
        tone: 'error',
        message,
      });
      setSyncStatus(null);
    }
  };

  const rosterState = getRosterState(
    guild?.memberCount ?? 0,
    guild?.rosteredMembers ?? 0,
    lastRosterSync
  );
  const topBlocker = strategicReadiness?.topMissingUnits[0] ?? null;
  const summary = strategicReadiness?.summary ?? null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-800" />
            <div className="mt-4 h-10 w-72 animate-pulse rounded bg-gray-800" />
            <div className="mt-3 h-4 w-56 animate-pulse rounded bg-gray-800" />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5"
              >
                <div className="h-4 w-24 animate-pulse rounded bg-gray-800" />
                <div className="mt-4 h-8 w-20 animate-pulse rounded bg-gray-800" />
                <div className="mt-3 h-4 w-32 animate-pulse rounded bg-gray-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
              Dashboard
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              No guild connected yet
            </h1>
            <p className="mt-3 text-base text-gray-400">
              Strategic platoon planning starts with a guild roster. Connect a guild to analyze
              bottlenecks, or use the demo planner to review the new readiness workflow.
            </p>
            {error && (
              <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-left text-sm text-red-200">
                {error}
              </div>
            )}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/planning/platoons?fixture=demo"
                className="inline-flex rounded-xl border border-blue-500 bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Open demo planner
              </Link>
              <Link
                href="/login"
                className="inline-flex rounded-xl border border-gray-700 bg-gray-900 px-5 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
              >
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <section className="rounded-3xl border border-gray-800 bg-gradient-to-br from-blue-950/50 via-gray-900 to-gray-950 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
                Strategic TB Readiness
              </p>
              <h1 className="mt-3 truncate text-3xl font-semibold tracking-tight sm:text-4xl">
                {guild.name}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {guild.slug && <DashboardPill label={`Slug: ${guild.slug}`} />}
                <DashboardPill label={rosterState.label} tone={rosterState.tone} />
                {strategicReadiness?.reference && (
                  <DashboardPill
                    label={`Reference: ${strategicReadiness.reference.name}`}
                    tone="info"
                  />
                )}
              </div>
              <p className="mt-4 max-w-3xl text-sm text-gray-300">
                Focus the guild on the units that unlock the most platoon coverage. This dashboard
                stays useful even without an active Territory Battle instance.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void handleSync()}
                disabled={Boolean(syncStatus)}
                className="rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
              >
                {syncStatus ? 'Syncing...' : 'Sync roster'}
              </button>
              <Link
                href="/planning/platoons"
                className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Open strategic planner
              </Link>
              {activeTb && (
                <Link
                  href={`/tb/${activeTb.id}/phase/1`}
                  className="rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
                >
                  Open live TB planner
                </Link>
              )}
            </div>
          </div>
        </section>

        {error && <Banner tone="error" message={error} className="mt-6" />}
        {notice && <Banner tone={notice.tone} message={notice.message} className="mt-6" />}

        {syncStatus && (
          <section className="mt-6 rounded-2xl border border-blue-900 bg-blue-950/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-blue-100">{syncStatus.msg}</p>
                <p className="mt-1 text-sm text-blue-200/80">
                  {syncStatus.current} of {syncStatus.total || '?'} members processed
                </p>
              </div>
              <span className="text-sm text-blue-200">
                {Math.round(
                  (syncStatus.current / (syncStatus.total || syncStatus.current || 1)) * 100
                )}
                %
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-950/80">
              <div
                className="h-full bg-blue-400 transition-all duration-300"
                style={{
                  width: `${(syncStatus.current / (syncStatus.total || syncStatus.current || 1)) * 100}%`,
                }}
              />
            </div>
          </section>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Guild members"
            value={`${guild.memberCount}`}
            detail={`${guild.rosteredMembers} members currently contribute relevant roster data`}
            tone="neutral"
          />
          <MetricCard
            title="Roster freshness"
            value={formatSyncDisplay(lastRosterSync)}
            detail={rosterState.detail}
            tone={rosterState.tone}
          />
          <MetricCard
            title="Coverable slots"
            value={summary ? `${summary.coverableSlots}/${summary.totalSlots}` : 'Waiting'}
            detail={
              summary
                ? `${summary.coveragePercent}% of imported platoon slots are currently coverable`
                : 'Reference or roster data is still incomplete'
            }
            tone={summary ? 'info' : 'warning'}
          />
          <MetricCard
            title="Missing slots"
            value={summary ? `${summary.missingSlots}` : 'Waiting'}
            detail={
              summary
                ? `${summary.blockedZones} blocked zones and ${summary.blockedPlatoons} blocked platoons`
                : 'Strategic readiness becomes available once data is present'
            }
            tone={summary && summary.missingSlots > 0 ? 'danger' : 'neutral'}
          />
          <MetricCard
            title="Top bottleneck"
            value={topBlocker ? topBlocker.unitName : 'None'}
            detail={
              topBlocker
                ? `${topBlocker.missingSlots} missing slots across ${topBlocker.blockedZones} zones`
                : 'No guild-wide blocker detected'
            }
            tone={topBlocker ? 'danger' : 'positive'}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Strategic snapshot
            </p>

            {summary ? (
              <>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  Platoon coverage at guild level
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  The current roster can fully cover {summary.estimatedCoverablePlatoons} of{' '}
                  {summary.totalPlatoons} platoons in the imported reference set.
                </p>

                <div className="mt-5 space-y-3">
                  {strategicReadiness?.topMissingUnits.slice(0, 4).map((unit) => (
                    <div
                      key={unit.unitName}
                      className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{unit.unitName}</p>
                          <p className="mt-1 text-sm text-gray-400">
                            Missing {unit.missingSlots} slot{unit.missingSlots === 1 ? '' : 's'}{' '}
                            across {unit.blockedZones} zone{unit.blockedZones === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="rounded-full border border-amber-900 bg-amber-950/50 px-3 py-1 text-xs text-amber-200">
                          Near misses {unit.nearMissOwners}
                        </span>
                      </div>
                    </div>
                  ))}

                  {strategicReadiness?.topMissingUnits.length === 0 && (
                    <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
                      No strategic blockers detected with current data.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  Strategic planner waiting for data
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  Import TB reference data and sync rosters to rank missing units and blocked
                  zones.
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Highest-pressure zones
            </p>

            {strategicReadiness?.zones.length ? (
              <div className="mt-4 space-y-3">
                {strategicReadiness.zones.map((zone) => (
                  <div
                    key={`${zone.phase}-${zone.zoneName}`}
                    className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">
                          Phase {zone.phase} {zone.zoneName}
                        </p>
                        <p className="mt-1 text-sm text-gray-400">
                          {zone.estimatedCoverablePlatoons}/{zone.totalPlatoons} platoons coverable
                          with {zone.missingSlots} missing slot
                          {zone.missingSlots === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs ${
                          zone.status === 'ready'
                            ? 'border-emerald-900 bg-emerald-950/50 text-emerald-200'
                            : zone.status === 'partial'
                              ? 'border-amber-900 bg-amber-950/50 text-amber-200'
                              : 'border-red-900 bg-red-950/50 text-red-200'
                        }`}
                      >
                        {zone.status}
                      </span>
                    </div>

                    {zone.blockers.length > 0 && (
                      <p className="mt-3 text-sm text-gray-500">
                        Blocking units: {zone.blockers.join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-400">
                Zone readiness will appear here once the strategic planner has enough data.
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Recommended actions
            </p>
            <div className="mt-4 space-y-3">
              {(strategicReadiness?.recommendedActions.length
                ? strategicReadiness.recommendedActions
                : ['Open the strategic planner to review guild-level platoon readiness.']
              ).map((action, index) => (
                <div
                  key={`${action}-${index}`}
                  className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-200"
                >
                  {action}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/planning/platoons"
                className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Open strategic planner
              </Link>
              <Link
                href="/planning/platoons?fixture=demo"
                className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
              >
                Review demo mode
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Operational planner
            </p>

            {activeTb ? (
              <>
                <h2 className="mt-3 text-2xl font-semibold text-white">{activeTb.name}</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Live Territory Battle operations remain available, but they are now a secondary
                  workflow after guild-level strategic readiness.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-sm">
                  <DashboardPill
                    label={`Status: ${formatStatus(activeTb.status)}`}
                    tone={activeTb.status === 'active' ? 'positive' : 'info'}
                  />
                  <DashboardPill label={`Roster sync: ${formatSyncDisplay(lastRosterSync)}`} />
                </div>
                <Link
                  href={`/tb/${activeTb.id}/phase/1`}
                  className="mt-6 inline-flex rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
                >
                  Open live planner
                </Link>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-2xl font-semibold text-white">No live TB instance linked</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Strategic planning is still fully available from roster plus reference data, so
                  the dashboard remains useful between events.
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

async function fetchDashboard() {
  const response = await fetch('/api/dashboard');
  const payload = (await response.json()) as ApiEnvelope<DashboardData>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? 'Dashboard could not be loaded.' : payload.error);
  }

  return payload.data;
}

function getRosterState(
  memberCount: number,
  rosteredMembers: number,
  lastRosterSync: string | null
) {
  if (memberCount === 0) {
    return {
      label: 'Guild import pending',
      detail: 'Import guild members first so readiness analysis can use real roster data.',
      tone: 'danger' as const,
    };
  }

  if (rosteredMembers === 0 || !lastRosterSync) {
    return {
      label: 'Roster sync recommended',
      detail: 'Guild members exist, but no current roster cache is available for strategic planning.',
      tone: 'warning' as const,
    };
  }

  return {
    label: 'Roster data available',
    detail: `${rosteredMembers} members currently contribute roster data.`,
    tone: 'positive' as const,
  };
}

function formatSyncDisplay(lastRosterSync: string | null) {
  if (!lastRosterSync) {
    return 'Never';
  }

  const date = new Date(lastRosterSync);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Banner({
  tone,
  message,
  className,
}: {
  tone: 'success' | 'error';
  message: string;
  className?: string;
}) {
  const toneClasses = {
    success: 'border-emerald-900 bg-emerald-950/40 text-emerald-200',
    error: 'border-red-900 bg-red-950/40 text-red-200',
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClasses[tone]} ${className ?? ''}`}>
      {message}
    </div>
  );
}

function DashboardPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
}) {
  const toneClasses = {
    neutral: 'border-gray-800 bg-gray-900/80 text-gray-300',
    positive: 'border-emerald-900 bg-emerald-950/50 text-emerald-200',
    warning: 'border-amber-900 bg-amber-950/50 text-amber-200',
    danger: 'border-red-900 bg-red-950/50 text-red-200',
    info: 'border-blue-900 bg-blue-950/50 text-blue-200',
  };

  return <span className={`rounded-full border px-3 py-1 ${toneClasses[tone]}`}>{label}</span>;
}

function MetricCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
}) {
  const toneClasses = {
    neutral: 'border-gray-800 bg-gray-900/70',
    positive: 'border-emerald-900 bg-emerald-950/30',
    warning: 'border-amber-900 bg-amber-950/30',
    danger: 'border-red-900 bg-red-950/30',
    info: 'border-blue-900 bg-blue-950/30',
  };

  return (
    <div className={`rounded-2xl border p-5 ${toneClasses[tone]}`}>
      <p className="text-sm text-gray-400">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm text-gray-500">{detail}</p>
    </div>
  );
}
