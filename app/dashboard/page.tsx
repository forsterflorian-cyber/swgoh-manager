'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Navbar } from '@/components/layout/Navbar';
import { formatDateTime } from '@/lib/utils/format-date';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ApiEnvelope } from '@/lib/types/api';

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

type MemberRegistration = {
  guildId: string;
  allyCode: string;
  guildName: string;
  guildSlug: string;
};

type RosterState = {
  label: string;
  tone: 'good' | 'warn' | 'bad';
  detail: string;
};

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

function getProgressColor(percent: number): string {
  if (percent >= 95) return 'progress-fill-emerald';
  if (percent >= 70) return 'progress-fill-blue';
  if (percent >= 40) return 'progress-fill-amber';
  return 'progress-fill-rose';
}

export default function DashboardPage() {
  const router = useRouter();
  const [guild, setGuild] = useState<DashboardGuild | null>(null);
  const [activeTb, setActiveTb] = useState<DashboardTb | null>(null);
  const [lastRosterSync, setLastRosterSync] = useState<string | null>(null);
  const [strategicReadiness, setStrategicReadiness] =
    useState<DashboardStrategicReadiness | null>(null);
  const [canManageGuild, setCanManageGuild] = useState(false);
  const [memberRegistration, setMemberRegistration] = useState<MemberRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinSlug, setJoinSlug] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const navbar = <Navbar />;

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

        if (!dashboard.guild) {
          try {
            const regRes = await fetch('/api/me/registration');
            const regPayload = (await regRes.json()) as ApiEnvelope<{ registration: MemberRegistration | null }>;
            if (regPayload.ok) {
              setMemberRegistration(regPayload.data.registration);
            }
          } catch {
            // non-critical, ignore
          }
        }
      } catch (loadError: unknown) {
        setError(loadError instanceof Error ? loadError.message : 'Dashboard could not be loaded');
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const deleted = params.get('deleted');
    const queryError = params.get('error');

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

    if (queryError === 'forbidden') {
      setNotice({
        tone: 'error',
        message: 'You are not allowed to delete this guild.',
      });
      return;
    }

    if (queryError === 'account_deleted') {
      setNotice({
        tone: 'success',
        message: 'Account deleted successfully.',
      });
      return;
    }

    if (queryError === 'account_delete_failed') {
      setNotice({
        tone: 'error',
        message: 'Account deletion failed.',
      });
      return;
    }

    if (queryError === 'account_delete_blocked') {
      setNotice({
        tone: 'error',
        message: 'Delete guild first before deleting your account.',
      });
    }
  }, []);

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

      const BATCH_SIZE = 5;
      let count = 0;
      const errors: string[] = [];

      for (let i = 0; i < members.length; i += BATCH_SIZE) {
        const batch = members.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (member) => {
            const response = await fetch(
              `/api/guild/${guild.id}/sync?allyCode=${member.ally_code}`,
              { method: 'POST' }
            );
            const payload = (await response.json()) as ApiEnvelope<{ syncedUnits: number }>;

            if (!response.ok || !payload.ok) {
              throw new Error(
                payload.ok
                  ? `Roster sync failed for ${member.player_name}.`
                  : payload.error,
              );
            }

            return member.player_name;
          })
        );

        for (const result of results) {
          count += 1;
          if (result.status === 'fulfilled') {
            setSyncStatus({
              current: count,
              total: members.length,
              msg: `Synced ${result.value} (${count}/${members.length})`,
            });
          } else {
            const errorMsg =
              result.reason instanceof Error
                ? result.reason.message
                : 'Unknown error';
            errors.push(errorMsg);
            setSyncStatus({
              current: count,
              total: members.length,
              msg: `Error: ${errorMsg}`,
            });
          }
        }

        if (errors.length > 0 && count < members.length) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      if (errors.length > 0) {
        throw new Error(
          `Roster sync completed with ${errors.length} error(s): ${errors[0]}`,
        );
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
      <div className="min-h-screen">
        {navbar}
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="card animate-pulse">
            <div className="h-8 w-48 rounded-lg bg-[var(--color-bg-tertiary)]" />
            <div className="mt-4 h-4 w-96 rounded bg-[var(--color-bg-tertiary)]" />
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="metric-card">
                  <div className="h-4 w-24 rounded bg-[var(--color-bg-tertiary)]" />
                  <div className="mt-4 h-10 w-20 rounded bg-[var(--color-bg-tertiary)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error === 'Unauthorized') {
    return (
      <div className="min-h-screen">
        {navbar}
        <main className="mx-auto max-w-4xl px-6 py-16">
          <section className="card card-glow-rose animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-rose)]">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold">Session expired</h2>
                <p className="mt-1 text-[var(--color-text-secondary)]">
                  Your session is no longer valid. Please log in again.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <Link href="/login" className="btn btn-primary">
                Log in again
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const noGuildConnected = !guild;
  const rosterCoveragePercent = strategicReadiness?.dataState
    ? Math.round(strategicReadiness.dataState.rosterCoverageRatio * 100)
    : 0;

  return (
    <div className="min-h-screen">
      {navbar}

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Notifications */}
        {error && (
          <section className="mb-6 card card-glow-rose animate-fade-in">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-[var(--color-accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          </section>
        )}

        {notice && (
          <section
            className={`mb-6 card animate-fade-in ${
              notice.tone === 'success' ? 'card-glow-emerald' : 'card-glow-rose'
            }`}
          >
            <div className="flex items-center gap-3">
              {notice.tone === 'success' ? (
                <svg className="h-5 w-5 text-[var(--color-accent-emerald)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-[var(--color-accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className="text-sm">{notice.message}</span>
            </div>
          </section>
        )}

        {noGuildConnected ? (
          <>
            {memberRegistration ? (
              /* Already registered — show member card only */
              <section className="card card-glow-blue animate-fade-in">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-blue)]">
                    <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[var(--color-text-muted)]">Guild member</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight">
                      {memberRegistration.guildName}
                    </h1>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Ally code {memberRegistration.allyCode}
                    </p>
                    <div className="mt-5">
                      <Link href={`/gilde/${memberRegistration.guildSlug}/meine-zuweisungen`}>
                        <button className="btn btn-primary">
                          View my assignments
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              /* Fresh account — two-path choice */
              <section className="grid gap-6 md:grid-cols-2 animate-fade-in">
                {/* Path A: guild admin */}
                <div className="card card-glow-blue flex flex-col">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-blue)]">
                    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h2 className="mt-4 text-xl font-bold tracking-tight">I manage a guild</h2>
                  <p className="mt-2 flex-1 text-sm text-[var(--color-text-secondary)]">
                    Connect your SWGOH guild, import members, and use the planner and matching tools.
                  </p>
                  <div className="mt-6">
                    <Link href="/settings/guild">
                      <button className="btn btn-primary w-full">
                        Set up my guild
                      </button>
                    </Link>
                  </div>
                </div>

                {/* Path B: guild member */}
                <div className="card flex flex-col">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-bg-tertiary)]">
                    <svg className="h-6 w-6 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h2 className="mt-4 text-xl font-bold tracking-tight">I&apos;m a guild member</h2>
                  <p className="mt-2 flex-1 text-sm text-[var(--color-text-secondary)]">
                    Enter your guild&apos;s slug to register with your ally code and view your assignments.
                  </p>
                  <form
                    className="mt-6 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const slug = joinSlug.trim().toLowerCase();
                      if (slug) router.push(`/gilde/${slug}/registrieren`);
                    }}
                  >
                    <input
                      type="text"
                      placeholder="guild-slug"
                      value={joinSlug}
                      onChange={(e) => setJoinSlug(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent-blue)] focus:outline-none"
                    />
                    <button type="submit" className="btn btn-primary shrink-0">
                      Join
                    </button>
                  </form>
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            {/* Guild Header */}
            <section className="card card-glow-blue mb-8 animate-fade-in">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">Guild configuration</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight">{guild.name}</h1>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Badge variant="neutral">
                      <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {guild.slug ?? 'no slug'}
                    </Badge>
                    <Badge variant={canManageGuild ? 'success' : 'neutral'}>
                      {canManageGuild ? '✓ Manage access' : '○ Read only'}
                    </Badge>
                    {activeTb && (
                      <Badge variant="info">
                        <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {activeTb.name}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleSync}
                    disabled={!canManageGuild || !guild.id || syncing}
                    className="btn btn-primary"
                  >
                    {syncing ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Syncing...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Sync roster
                      </>
                    )}
                  </button>

                  <Link href="/settings/guild">
                    <button className="btn btn-secondary">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </button>
                  </Link>
                </div>
              </div>
            </section>

            {/* Metric Cards */}
            <section className="mb-8 grid gap-6 md:grid-cols-3">
              <div className="metric-card animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="metric-label">Guild members</div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-blue)]">
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div className="metric-value">{guild.memberCount}</div>
                <div className="metric-detail">Imported guild members</div>
              </div>

              <div className="metric-card animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="metric-label">Rostered members</div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-emerald)]">
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="metric-value">{guild.rosteredMembers}</div>
                <div className="metric-detail">Members with synced roster data</div>
              </div>

              <div className={`metric-card animate-fade-in ${
                rosterState.tone === 'good' ? 'card-glow-emerald' : 
                rosterState.tone === 'warn' ? 'card-glow-amber' : 'card-glow-rose'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="metric-label">Roster status</div>
                  <Badge variant={
                    rosterState.tone === 'good' ? 'success' : 
                    rosterState.tone === 'warn' ? 'warning' : 'danger'
                  }>
                    {rosterState.label}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${getProgressColor(rosterCoveragePercent)}`}
                      style={{ width: `${rosterCoveragePercent}%` }}
                    />
                  </div>
                  <div className="mt-2 text-sm text-[var(--color-text-muted)]">
                    {rosterState.detail}
                  </div>
                </div>
              </div>
            </section>

            {/* Data Status & Public Surfaces */}
            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              {/* Data Status */}
              <div className="card animate-fade-in">
                <h2 className="text-xl font-semibold">Data status</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Keep guild membership and roster data up to date.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="stat-card">
                    <div className="stat-label">Last roster sync</div>
                    <div className="stat-value text-lg">{formatDateTime(lastRosterSync)}</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Reference dataset</div>
                    <div className="stat-value text-lg">
                      {strategicReadiness?.reference?.name ?? 'Not available'}
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">SWGOH.GG ID</div>
                    <div className="stat-value text-lg font-mono">
                      {guild.swgoh_gg_id ?? 'Not connected'}
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Roster coverage</div>
                    <div className="stat-value text-lg">
                      {rosterCoveragePercent}%
                    </div>
                    <div className="progress-bar mt-2">
                      <div
                        className={`progress-fill ${getProgressColor(rosterCoveragePercent)}`}
                        style={{ width: `${rosterCoveragePercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Sync Progress */}
                {syncStatus && (
                  <div className="mt-6 rounded-xl border border-[var(--color-accent-blue)] bg-[rgb(59_130_246_/_0.1)] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--color-accent-blue)]">
                        {syncStatus.msg}
                      </span>
                      <span className="text-sm text-[var(--color-text-muted)]">
                        {syncStatus.total > 0
                          ? `${syncStatus.current}/${syncStatus.total}`
                          : 'Preparing…'}
                      </span>
                    </div>
                    {syncStatus.total > 0 && (
                      <div className="mt-3 progress-bar">
                        <div
                          className="progress-fill progress-fill-blue"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, (syncStatus.current / syncStatus.total) * 100),
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Public Surfaces */}
              <div className="card animate-fade-in">
                <h2 className="text-xl font-semibold">Public surfaces</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Share planning tools with your guild.
                </p>

                <div className="mt-6 space-y-4">
                  <div className="rounded-xl border border-[var(--color-border-primary)] p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-blue)]">
                        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">Public matching</div>
                        <div className="text-xs text-[var(--color-text-muted)]">Read-only status board</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      {publicMatchingHref ? (
                        <Link href={publicMatchingHref} target="_blank" rel="noreferrer">
                          <button className="btn btn-secondary w-full">Open matching</button>
                        </Link>
                      ) : (
                        <div className="text-sm text-[var(--color-text-muted)]">Set a slug first.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--color-border-primary)] p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-purple)]">
                        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">Public simulator</div>
                        <div className="text-xs text-[var(--color-text-muted)]">Officer planning tool</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      {publicSimulatorHref ? (
                        <Link href={publicSimulatorHref} target="_blank" rel="noreferrer">
                          <button className="btn btn-secondary w-full">Open simulator</button>
                        </Link>
                      ) : (
                        <div className="text-sm text-[var(--color-text-muted)]">Set a slug first.</div>
                      )}
                    </div>
                  </div>

                  {activeTb && (
                    <div className="rounded-xl border border-[var(--color-accent-emerald)] p-4 card-glow-emerald">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-emerald)]">
                          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">Live planner</div>
                          <div className="text-xs text-[var(--color-text-muted)]">Active: {activeTb.name}</div>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Link href={`/tb/${activeTb.id}/phase/1`}>
                          <button className="btn btn-primary w-full">Open live planner</button>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* Danger Zone */}
        <section className="mt-8 card card-glow-rose animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-rose)]">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Danger Zone</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Irreversible actions. Proceed with caution.
              </p>
            </div>
          </div>

          <div className="mt-6">
            {noGuildConnected ? (
              <form action="/api/account/delete" method="post">
                <button type="submit" className="btn btn-danger">
                  Delete account
                </button>
              </form>
            ) : (
              <div>
                <button disabled className="btn btn-danger opacity-50 cursor-not-allowed">
                  Delete account
                </button>
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                  Delete guild first before deleting your account.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}