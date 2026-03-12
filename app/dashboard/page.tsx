'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type DashboardGuild = {
  id: string;
  name: string;
  slug: string;
  swgoh_gg_id: string | null;
  memberCount: number;
};

type DashboardTb = {
  id: string;
  name: string;
  status: string;
};

type DashboardData = {
  guild: DashboardGuild | null;
  activeTb: DashboardTb | null;
  lastRosterSync: string | null;
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
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Dashboard konnte nicht geladen werden');
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
      setSyncStatus({ current: 0, total: 0, msg: 'Initialisiere Gilde...' });

      const initRes = await fetch(`/api/guild/${guild.id}/sync`, { method: 'POST' });
      const initData = (await initRes.json()) as ApiEnvelope<{ imported: number; total: number }>;

      if (!initRes.ok || !initData.ok) {
        throw new Error(initData.ok ? 'Gilden-Import fehlgeschlagen.' : initData.error);
      }

      const membersRes = await fetch(`/api/guild/${guild.id}/members`);
      const membersData = (await membersRes.json()) as ApiEnvelope<{
        members: GuildMemberSummary[];
      }>;

      if (!membersRes.ok || !membersData.ok) {
        throw new Error(
          membersData.ok ? 'Mitglieder konnten nicht geladen werden.' : membersData.error
        );
      }

      const members = membersData.data.members;
      if (!members || members.length === 0) {
        throw new Error('Keine Mitglieder gefunden.');
      }

      setSyncStatus({
        current: 0,
        total: members.length,
        msg: 'Starte Roster-Sync...',
      });

      let count = 0;
      for (const member of members) {
        count += 1;
        setSyncStatus({
          current: count,
          total: members.length,
          msg: `Sync: ${member.player_name}...`,
        });

        const res = await fetch(`/api/guild/${guild.id}/sync?allyCode=${member.ally_code}`, {
          method: 'POST',
        });
        const data = (await res.json()) as ApiEnvelope<{ syncedUnits: number }>;

        if (!res.ok || !data.ok) {
          throw new Error(
            data.ok ? `Roster-Sync fehlgeschlagen fuer ${member.player_name}` : data.error
          );
        }
      }

      setSyncStatus({
        current: members.length,
        total: members.length,
        msg: 'Sync erfolgreich abgeschlossen.',
      });

      const dashboard = await fetchDashboard();
      setGuild(dashboard.guild);
      setActiveTb(dashboard.activeTb);
      setLastRosterSync(dashboard.lastRosterSync);
      setNotice({
        tone: 'success',
        message: 'Roster-Sync erfolgreich abgeschlossen.',
      });

      window.setTimeout(() => setSyncStatus(null), 2500);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Synchronisierung fehlgeschlagen';

      setNotice({
        tone: 'error',
        message,
      });
      setSyncStatus(null);
    }
  };

  const rosterState = getRosterState(guild?.memberCount ?? 0, lastRosterSync);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-800" />
            <div className="mt-4 h-10 w-72 animate-pulse rounded bg-gray-800" />
            <div className="mt-3 h-4 w-56 animate-pulse rounded bg-gray-800" />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
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
              Connect or create a guild first so the dashboard can show planning context and
              roster status.
            </p>
            {error && (
              <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-left text-sm text-red-200">
                {error}
              </div>
            )}
            <Link
              href="/guild/create"
              className="mt-8 inline-flex rounded-xl border border-blue-500 bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Open guild setup
            </Link>
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
                Guild operations
              </p>
              <h1 className="mt-3 truncate text-3xl font-semibold tracking-tight sm:text-4xl">
                {guild.name}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <DashboardPill label={`Slug: ${guild.slug}`} />
                <DashboardPill
                  label={
                    guild.swgoh_gg_id
                      ? `swgoh.gg: ${guild.swgoh_gg_id}`
                      : 'swgoh.gg ID not linked'
                  }
                />
                <DashboardPill label={rosterState.label} tone={rosterState.tone} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void handleSync()}
                disabled={Boolean(syncStatus)}
                className="rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
              >
                {syncStatus ? 'Synchronisiere...' : 'Roster synchronisieren'}
              </button>
              <Link
                href={`/gilde/${guild.slug}`}
                className="rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
              >
                Open guild board
              </Link>
              {activeTb && (
                <Link
                  href={`/tb/${activeTb.id}/phase/1`}
                  className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  Open TB planner
                </Link>
              )}
            </div>
          </div>
        </section>

        {error && (
          <Banner
            tone="error"
            message={error}
            className="mt-6"
          />
        )}

        {notice && (
          <Banner
            tone={notice.tone}
            message={notice.message}
            className="mt-6"
          />
        )}

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

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Guild members"
            value={`${guild.memberCount}`}
            detail={
              guild.memberCount > 0
                ? 'Imported members currently available in the database'
                : 'No member roster imported yet'
            }
            tone="neutral"
          />
          <MetricCard
            title="Roster freshness"
            value={formatSyncDisplay(lastRosterSync)}
            detail={rosterState.detail}
            tone={rosterState.tone}
          />
          <MetricCard
            title="Active TB"
            value={activeTb ? activeTb.name : 'None'}
            detail={
              activeTb
                ? `Status: ${formatStatus(activeTb.status)}`
                : 'No planning or active TB is linked to this guild right now'
            }
            tone={activeTb ? 'info' : 'neutral'}
          />
          <MetricCard
            title="Next step"
            value={getNextActionTitle(guild.memberCount, activeTb, lastRosterSync)}
            detail={getNextActionDetail(guild.memberCount, activeTb, lastRosterSync)}
            tone="neutral"
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Planning context
            </p>
            {activeTb ? (
              <>
                <h2 className="mt-3 text-2xl font-semibold text-white">{activeTb.name}</h2>
                <p className="mt-2 text-sm text-gray-400">
                  The current planner is ready to review zone progress, fill open slots, and
                  confirm assignments for the active phase.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <DashboardPill
                    label={`Status: ${formatStatus(activeTb.status)}`}
                    tone={activeTb.status === 'active' ? 'positive' : 'info'}
                  />
                  <DashboardPill label={`Roster sync: ${formatSyncDisplay(lastRosterSync)}`} />
                </div>
                <Link
                  href={`/tb/${activeTb.id}/phase/1`}
                  className="mt-6 inline-flex rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  Go to planner
                </Link>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-2xl font-semibold text-white">No active planning board</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Once a Territory Battle instance exists for this guild, it will show up here.
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Recommended actions
            </p>
            <div className="mt-4 space-y-3">
              <ActionRow
                title="Review guild board"
                description="Check the public-facing guild overview and current assignments."
                href={`/gilde/${guild.slug}`}
                label="Open guild board"
              />
              <ActionRow
                title="Refresh roster data"
                description="Use a manual sync when you need the latest roster ownership and relic state."
                buttonLabel={syncStatus ? 'Synchronisiere...' : 'Start roster sync'}
                onClick={() => void handleSync()}
                disabled={Boolean(syncStatus)}
              />
              {activeTb && (
                <ActionRow
                  title="Inspect planner"
                  description="Open the current Territory Battle planner and resolve remaining gaps."
                  href={`/tb/${activeTb.id}/phase/1`}
                  label="Open planner"
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

async function fetchDashboard() {
  const res = await fetch('/api/dashboard');
  const payload = (await res.json()) as ApiEnvelope<DashboardData>;

  if (!res.ok || !payload.ok) {
    throw new Error(payload.ok ? 'Dashboard konnte nicht geladen werden' : payload.error);
  }

  return payload.data;
}

function getRosterState(memberCount: number, lastRosterSync: string | null) {
  if (memberCount === 0) {
    return {
      label: 'Roster import pending',
      detail: 'Import guild members before assignment planning can rely on roster data.',
      tone: 'danger' as const,
    };
  }

  if (!lastRosterSync) {
    return {
      label: 'Roster sync recommended',
      detail: 'Members exist, but no completed roster sync timestamp is stored yet.',
      tone: 'warning' as const,
    };
  }

  return {
    label: 'Roster data available',
    detail: `Last completed sync: ${formatSyncDisplay(lastRosterSync)}`,
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

function getNextActionTitle(
  memberCount: number,
  activeTb: DashboardTb | null,
  lastRosterSync: string | null
) {
  if (memberCount === 0) {
    return 'Import guild data';
  }

  if (!lastRosterSync) {
    return 'Run roster sync';
  }

  if (activeTb) {
    return 'Review planner';
  }

  return 'Open guild board';
}

function getNextActionDetail(
  memberCount: number,
  activeTb: DashboardTb | null,
  lastRosterSync: string | null
) {
  if (memberCount === 0) {
    return 'Members are required before roster ownership and assignments become useful.';
  }

  if (!lastRosterSync) {
    return 'Roster ownership has not been refreshed yet for the current guild data.';
  }

  if (activeTb) {
    return 'Use the planner to resolve remaining open slots and conflicts.';
  }

  return 'No active TB is available, but the guild board is ready for review.';
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

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClasses[tone]} ${className ?? ''}`}>{message}</div>;
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

function ActionRow({
  title,
  description,
  href,
  label,
  buttonLabel,
  onClick,
  disabled = false,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
  buttonLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-sm text-gray-400">{description}</p>
      {href && label && (
        <Link
          href={href}
          className="mt-4 inline-flex rounded-xl border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
        >
          {label}
        </Link>
      )}
      {!href && onClick && buttonLabel && (
        <button
          onClick={onClick}
          disabled={disabled}
          className="mt-4 inline-flex rounded-xl border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}
