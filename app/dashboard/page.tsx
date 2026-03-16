
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';

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
  permissions: {
    canManageGuild: boolean;
  };
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

type RosterState = {
  label: string;
  tone: 'good' | 'warn' | 'bad';
  detail: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getRosterState(
  memberCount: number,
  rosteredMembers: number,
  lastRosterSync: string | null,
): RosterState {
  if (memberCount <= 0) {
    return {
      label: 'No guild data',
      tone: 'bad',
      detail: 'Connect a guild first.',
    };
  }

  if (rosteredMembers <= 0) {
    return {
      label: 'Roster missing',
      tone: 'bad',
      detail: 'Run the initial roster sync.',
    };
  }

  const ratio = memberCount > 0 ? rosteredMembers / memberCount : 0;

  if (ratio >= 0.95) {
    return {
      label: 'Healthy',
      tone: 'good',
      detail: `Last sync: ${formatDateTime(lastRosterSync)}`,
    };
  }

  if (ratio >= 0.7) {
    return {
      label: 'Partial',
      tone: 'warn',
      detail: `${rosteredMembers}/${memberCount} rostered · last sync ${formatDateTime(lastRosterSync)}`,
    };
  }

  return {
    label: 'Needs sync',
    tone: 'bad',
    detail: `${rosteredMembers}/${memberCount} rostered · last sync ${formatDateTime(lastRosterSync)}`,
  };
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/dashboard', { cache: 'no-store' });
  const payload = (await res.json()) as ApiEnvelope<DashboardData>;

  if (!res.ok || !payload.ok) {
    throw new Error(payload.ok ? 'Dashboard could not be loaded.' : payload.error);
  }

  return payload.data;
}

function cardToneClasses(tone: RosterState['tone']) {
  switch (tone) {
    case 'good':
      return 'border-emerald-900/70 bg-emerald-950/20 text-emerald-200';
    case 'warn':
      return 'border-amber-900/70 bg-amber-950/20 text-amber-200';
    case 'bad':
      return 'border-rose-900/70 bg-rose-950/20 text-rose-200';
    default:
      return 'border-slate-800 bg-slate-950 text-slate-200';
  }
}

function actionButtonClasses(primary = false) {
  return primary
    ? 'inline-flex items-center justify-center rounded-2xl border border-indigo-700/70 bg-indigo-500/10 px-4 py-3 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/20'
    : 'inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800';
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [guild, setGuild] = useState<DashboardGuild | null>(null);
  const [activeTb, setActiveTb] = useState<DashboardTb | null>(null);
  const [lastRosterSync, setLastRosterSync] = useState<string | null>(null);
  const [strategicReadiness, setStrategicReadiness] =
    useState<DashboardStrategicReadiness | null>(null);
  const [canManageGuild, setCanManageGuild] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const navbar = (
    <Navbar
      guildName={guild?.name ?? null}
      guildSlug={guild?.slug ?? null}
      canManageGuild={canManageGuild}
    />
  );

  useEffect(() => {
    async function loadDashboard() {
      try {
        const dashboard = await fetchDashboard();
        setGuild(dashboard.guild);
        setActiveTb(dashboard.activeTb);
        setLastRosterSync(dashboard.lastRosterSync);
        setStrategicReadiness(dashboard.strategicReadiness);
        setCanManageGuild(dashboard.permissions.canManageGuild);
        setError(null);
      } catch (loadError: unknown) {
        setError(loadError instanceof Error ? loadError.message : 'Dashboard could not be loaded');
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  useEffect(() => {
    const deleted = searchParams.get('deleted');
    const queryError = searchParams.get('error');

    if (deleted === '1') {
      setNotice({
        tone: 'success',
        message: 'Guild configuration was deleted. Connect a new guild to continue.',
      });
      return;
    }

    if (queryError === 'delete_failed') {
      setNotice({
        tone: 'error',
        message: 'Guild deletion failed.',
      });
      return;
    }
  }, [searchParams]);

  const rosterState = useMemo(
    () => getRosterState(guild?.memberCount ?? 0, guild?.rosteredMembers ?? 0, lastRosterSync),
    [guild?.memberCount, guild?.rosteredMembers, lastRosterSync],
  );

  const publicMatchingHref =
    guild?.slug ? `/public/guild/${guild.slug}/matching` : null;
  const publicSimulatorHref =
    guild?.slug ? `/public/guild/${guild.slug}/simulator` : null;

  async function refreshDashboardAfterSync() {
    const dashboard = await fetchDashboard();
    setGuild(dashboard.guild);
    setActiveTb(dashboard.activeTb);
    setLastRosterSync(dashboard.lastRosterSync);
    setStrategicReadiness(dashboard.strategicReadiness);
    setCanManageGuild(dashboard.permissions.canManageGuild);
  }

  const handleSync = async () => {
    if (!guild?.id || syncing) {
      return;
    }

    setSyncing(true);
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
            payload.ok ? `Roster sync failed for ${member.player_name}.` : payload.error,
          );
        }
      }

      setSyncStatus({
        current: members.length,
        total: members.length,
        msg: 'Roster sync completed.',
      });

      await refreshDashboardAfterSync();

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
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        {navbar}
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-8 text-sm text-slate-400">
            Loading dashboard…
          </div>
        </div>
      </div>
    );
  }

  const noGuildConnected = !guild;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {navbar}

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        {error ? (
          <section className="rounded-3xl border border-rose-900/60 bg-rose-950/30 p-5 text-sm text-rose-200">
            {error}
          </section>
        ) : null}

        {notice ? (
          <section
            className={`rounded-3xl border p-5 text-sm ${
              notice.tone === 'success'
                ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200'
                : 'border-rose-900/60 bg-rose-950/30 text-rose-200'
            }`}
          >
            {notice.message}
          </section>
        ) : null}

        {noGuildConnected ? (
          <>
            <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-8 shadow-[0_0_0_1px_rgba(15,23,42,0.25)]">
              <p className="text-sm text-slate-400">Guild setup</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                No guild connected
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-400">
                Connect a guild first. After that you can sync members and roster data, then use
                public matching and the simulator.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href="/settings/guild" className={actionButtonClasses(true)}>
                  Connect guild
                </Link>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Step 1</div>
                <div className="mt-3 text-xl font-semibold text-white">Connect guild</div>
                <p className="mt-2 text-sm text-slate-400">
                  Add your SWGOH guild identifier and choose the public slug used by matching and simulator.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Step 2</div>
                <div className="mt-3 text-xl font-semibold text-white">Sync roster</div>
                <p className="mt-2 text-sm text-slate-400">
                  Import guild members and roster data so planning surfaces work with current data.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Step 3</div>
                <div className="mt-3 text-xl font-semibold text-white">Plan and manage</div>
                <p className="mt-2 text-sm text-slate-400">
                  Use public matching for visibility and the simulator for officer planning and exports.
                </p>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.25)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm text-slate-400">Guild configuration</div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                    {guild.name}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                    <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1">
                      Slug: {guild.slug ?? 'not set'}
                    </span>
                    <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1">
                      Manage access: {canManageGuild ? 'Yes' : 'No'}
                    </span>
                    {activeTb ? (
                      <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1">
                        Active TB: {activeTb.name}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={!canManageGuild || !guild.id || syncing}
                    className={actionButtonClasses(true)}
                  >
                    {syncing ? 'Sync running…' : 'Sync roster'}
                  </button>

                  <Link href="/settings/guild" className={actionButtonClasses()}>
                    Open guild settings
                  </Link>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                <div className="text-sm text-slate-400">Guild members</div>
                <div className="mt-3 text-4xl font-semibold text-white">
                  {guild.memberCount}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  Imported guild members
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                <div className="text-sm text-slate-400">Rostered members</div>
                <div className="mt-3 text-4xl font-semibold text-white">
                  {guild.rosteredMembers}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  Members with synced roster data
                </div>
              </div>

              <div className={`rounded-3xl border p-6 ${cardToneClasses(rosterState.tone)}`}>
                <div className="text-sm opacity-80">Roster status</div>
                <div className="mt-3 text-2xl font-semibold">{rosterState.label}</div>
                <div className="mt-2 text-sm opacity-80">{rosterState.detail}</div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Data status</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Keep guild membership and roster data up to date.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Last roster sync
                    </div>
                    <div className="mt-2 text-lg font-medium text-slate-100">
                      {formatDateTime(lastRosterSync)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Reference dataset
                    </div>
                    <div className="mt-2 text-lg font-medium text-slate-100">
                      {strategicReadiness?.reference?.name ?? 'Not available'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      SWGOH.GG ID
                    </div>
                    <div className="mt-2 text-lg font-medium text-slate-100">
                      {guild.swgoh_gg_id ?? 'Not connected'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Roster coverage ratio
                    </div>
                    <div className="mt-2 text-lg font-medium text-slate-100">
                      {strategicReadiness?.dataState
                        ? `${Math.round(strategicReadiness.dataState.rosterCoverageRatio * 100)}%`
                        : '—'}
                    </div>
                  </div>
                </div>

                {syncStatus ? (
                  <div className="mt-5 rounded-2xl border border-indigo-900/60 bg-indigo-950/20 p-4">
                    <div className="text-sm font-medium text-indigo-200">{syncStatus.msg}</div>
                    <div className="mt-2 text-sm text-indigo-300/80">
                      {syncStatus.total > 0
                        ? `${syncStatus.current}/${syncStatus.total}`
                        : 'Preparing…'}
                    </div>
                    {syncStatus.total > 0 ? (
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, (syncStatus.current / syncStatus.total) * 100),
                            )}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                <h2 className="text-xl font-semibold text-white">Public surfaces</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Matching is the shared status board. Simulator is the officer planning tool.
                </p>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
                    <div className="text-sm font-medium text-slate-100">Public matching</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Read-only current state with filters
                    </div>
                    <div className="mt-4">
                      {publicMatchingHref ? (
                        <Link
                          href={publicMatchingHref}
                          target="_blank"
                          rel="noreferrer"
                          className={actionButtonClasses()}
                        >
                          Open matching
                        </Link>
                      ) : (
                        <div className="text-sm text-slate-500">Set a slug first.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
                    <div className="text-sm font-medium text-slate-100">Public simulator</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Manual and auto planning with export
                    </div>
                    <div className="mt-4">
                      {publicSimulatorHref ? (
                        <Link
                          href={publicSimulatorHref}
                          target="_blank"
                          rel="noreferrer"
                          className={actionButtonClasses()}
                        >
                          Open simulator
                        </Link>
                      ) : (
                        <div className="text-sm text-slate-500">Set a slug first.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-black/20 p-4">
                    <div className="text-sm font-medium text-slate-100">Live planner</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Operational TB planner for active events
                    </div>
                    <div className="mt-4">
                      {activeTb ? (
                        <Link href={`/tb/${activeTb.id}/phase/1`} className={actionButtonClasses()}>
                          Open live planner
                        </Link>
                      ) : (
                        <div className="text-sm text-slate-500">No active TB linked.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
