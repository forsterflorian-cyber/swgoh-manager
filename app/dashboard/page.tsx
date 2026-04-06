'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, ExternalLink, RefreshCw, Settings, ShieldCheck, UserRound } from 'lucide-react';

import { AppContainer, AppSection, AppShell, MetricTile, SectionHeader } from '@/components/app/AppShell';
import { Navbar } from '@/components/layout/Navbar';
import { EmptyStateCard } from '@/components/workspace/WorkspacePrimitives';
import { formatDateTime } from '@/lib/utils/format-date';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ApiEnvelope } from '@/lib/types/api';
import { routes } from '@/lib/utils/routes';

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
  summary?: {
    coverablePlatoons?: number;
    totalPlatoons?: number;
  } | null;
  topMissingUnits?: Array<{
    unitName: string;
    missingSlots: number;
    reasonSummary?: string;
  }>;
  zones?: Array<{
    phase: number;
    zoneName: string;
    missingSlots: number;
    blockers: string[];
  }>;
  recommendedActions?: string[];
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

function getRosterState(memberCount: number, rosteredMembers: number, lastRosterSync: string | null): RosterState {
  if (memberCount <= 0) {
    return { label: 'No guild data', tone: 'bad', detail: 'Connect a guild first.' };
  }
  if (rosteredMembers <= 0) {
    return { label: 'Roster missing', tone: 'bad', detail: 'Run the initial roster sync.' };
  }

  const ratio = memberCount > 0 ? rosteredMembers / memberCount : 0;
  if (ratio >= 0.95) {
    return { label: 'Healthy', tone: 'good', detail: `Last sync: ${formatDateTime(lastRosterSync)}` };
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

function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${notice.tone === 'success' ? 'border-emerald-800 bg-emerald-950/30 text-emerald-100' : 'border-rose-800 bg-rose-950/30 text-rose-100'}`}>
      {notice.message}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [guild, setGuild] = useState<DashboardGuild | null>(null);
  const [activeTb, setActiveTb] = useState<DashboardTb | null>(null);
  const [lastRosterSync, setLastRosterSync] = useState<string | null>(null);
  const [strategicReadiness, setStrategicReadiness] = useState<DashboardStrategicReadiness | null>(null);
  const [canManageGuild, setCanManageGuild] = useState(false);
  const [memberRegistration, setMemberRegistration] = useState<MemberRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinSlug, setJoinSlug] = useState('');
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
            // non critical
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
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const deleted = params.get('deleted');
    const queryError = params.get('error');
    if (deleted === '1') {
      setNotice({ tone: 'success', message: 'Guild configuration was deleted. Connect a new guild to continue.' });
      return;
    }
    if (queryError === 'delete_failed') {
      setNotice({ tone: 'error', message: 'Guild deletion failed.' });
      return;
    }
    if (queryError === 'forbidden') {
      setNotice({ tone: 'error', message: 'You are not allowed to delete this guild.' });
      return;
    }
    if (queryError === 'account_deleted') {
      setNotice({ tone: 'success', message: 'Account deleted successfully.' });
      return;
    }
    if (queryError === 'account_delete_failed') {
      setNotice({ tone: 'error', message: 'Account deletion failed.' });
      return;
    }
    if (queryError === 'account_delete_blocked') {
      setNotice({ tone: 'error', message: 'Delete the guild first before deleting the account.' });
    }
  }, []);

  const rosterState = useMemo(() => getRosterState(guild?.memberCount ?? 0, guild?.rosteredMembers ?? 0, lastRosterSync), [guild?.memberCount, guild?.rosteredMembers, lastRosterSync]);
  const publicMatchingHref = guild?.slug ? routes.matching(guild.slug) : null;
  const publicSimulatorHref = guild?.slug ? routes.simulator(guild.slug) : null;

  async function refreshDashboardAfterSync() {
    const dashboard = await fetchDashboard();
    setGuild(dashboard.guild);
    setActiveTb(dashboard.activeTb);
    setLastRosterSync(dashboard.lastRosterSync);
    setStrategicReadiness(dashboard.strategicReadiness);
    setCanManageGuild(dashboard.permissions.canManageGuild);
  }

  const handleSync = async () => {
    if (!guild?.id || syncing) return;
    setSyncing(true);
    setError(null);
    setNotice(null);

    try {
      setSyncStatus({ current: 0, total: 0, msg: 'Initializing guild sync...' });

      const initRes = await fetch(`/api/guild/${guild.id}/sync`, { method: 'POST' });
      const initData = (await initRes.json()) as ApiEnvelope<{ imported: number; total: number }>;
      if (!initRes.ok || !initData.ok) throw new Error(initData.ok ? 'Guild import failed.' : initData.error);

      const membersRes = await fetch(`/api/guild/${guild.id}/members`);
      const membersData = (await membersRes.json()) as ApiEnvelope<{ members: GuildMemberSummary[] }>;
      if (!membersRes.ok || !membersData.ok) throw new Error(membersData.ok ? 'Members could not be loaded.' : membersData.error);

      const members = membersData.data.members;
      if (members.length === 0) throw new Error('No guild members found.');

      setSyncStatus({ current: 0, total: members.length, msg: 'Starting roster sync...' });
      const BATCH_SIZE = 5;
      let count = 0;
      const errors: string[] = [];

      for (let i = 0; i < members.length; i += BATCH_SIZE) {
        const batch = members.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (member) => {
            const response = await fetch(`/api/guild/${guild.id}/sync?allyCode=${member.ally_code}`, { method: 'POST' });
            const payload = (await response.json()) as ApiEnvelope<{ syncedUnits: number }>;
            if (!response.ok || !payload.ok) {
              throw new Error(payload.ok ? `Roster sync failed for ${member.player_name}.` : payload.error);
            }
            return member.player_name;
          }),
        );

        for (const result of results) {
          count += 1;
          if (result.status === 'fulfilled') {
            setSyncStatus({ current: count, total: members.length, msg: `Synced ${result.value} (${count}/${members.length})` });
          } else {
            const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
            errors.push(errorMsg);
            setSyncStatus({ current: count, total: members.length, msg: `Error: ${errorMsg}` });
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Roster sync completed with ${errors.length} error(s): ${errors[0]}`);
      }

      setSyncStatus({ current: members.length, total: members.length, msg: 'Roster sync completed.' });
      await refreshDashboardAfterSync();
      setNotice({ tone: 'success', message: 'Roster sync completed successfully.' });
      window.setTimeout(() => setSyncStatus(null), 2500);
    } catch (syncError: unknown) {
      const message = syncError instanceof Error ? syncError.message : 'Roster synchronization failed.';
      setNotice({ tone: 'error', message });
      setSyncStatus(null);
    } finally {
      setSyncing(false);
    }
  };

  const noGuildConnected = !guild;
  const rosterCoveragePercent = strategicReadiness?.dataState ? Math.round(strategicReadiness.dataState.rosterCoverageRatio * 100) : 0;

  return (
    <AppShell>
      <Navbar />
      <AppContainer>
        {loading ? (
          <AppSection>
            <div className="space-y-4 animate-pulse">
              <div className="h-8 w-60 rounded-xl bg-slate-800" />
              <div className="h-4 w-96 rounded-xl bg-slate-900" />
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((item) => <div key={item} className="h-32 rounded-2xl bg-slate-900" />)}
              </div>
            </div>
          </AppSection>
        ) : error === 'Unauthorized' ? (
          <AppSection className="max-w-3xl border-rose-900/70 bg-rose-950/20">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-rose-600/20 p-3 text-rose-300"><AlertTriangle className="h-6 w-6" /></div>
              <div>
                <h1 className="text-2xl font-semibold">Session expired</h1>
                <p className="mt-2 text-sm text-slate-300">Your session is no longer valid. Log in again to continue.</p>
                <div className="mt-5">
                  <Link href={routes.login()}><Button>Log in again</Button></Link>
                </div>
              </div>
            </div>
          </AppSection>
        ) : (
          <div className="space-y-6">
            {error ? <NoticeBanner notice={{ tone: 'error', message: error }} /> : null}
            {notice ? <NoticeBanner notice={notice} /> : null}

            {noGuildConnected ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <AppSection>
                  <SectionHeader
                    eyebrow="Start here"
                    title={memberRegistration ? `Welcome back to ${memberRegistration.guildName}` : 'Choose your starting path'}
                    description={memberRegistration ? `Your Discord account is already registered with ally code ${memberRegistration.allyCode}. Continue directly into the member workspace.` : 'The app separates officer setup from member onboarding. Start with the path that matches what you need to do today.'}
                  />
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <EmptyStateCard
                      badge="Officer"
                      title="Set up a guild workspace"
                      description="Connect your guild, sync roster data and publish the planning surfaces your members will actually use."
                      action={<Link href={routes.guildSettings()}><Button fullWidth leftIcon={<ShieldCheck className="h-4 w-4" />}>Open guild setup</Button></Link>}
                    />
                    <EmptyStateCard
                      badge="Member"
                      title={memberRegistration ? 'Open my assignments' : 'Join with a guild slug'}
                      description={memberRegistration ? 'Your member identity is already linked. Go straight to your personal assignment view.' : 'Ask an officer for the guild slug, then register your ally code to unlock your personal assignment workspace.'}
                      action={memberRegistration ? (
                        <Link href={routes.assignments(memberRegistration.guildSlug)}>
                          <Button variant="secondary" fullWidth leftIcon={<UserRound className="h-4 w-4" />}>Open my workspace</Button>
                        </Link>
                      ) : undefined}
                    />
                  </div>
                  {!memberRegistration ? (
                    <form
                      className="mt-6 flex flex-col gap-3 sm:flex-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const slug = joinSlug.trim().toLowerCase();
                        if (slug) router.push(routes.registration(slug));
                      }}
                    >
                      <input
                        type="text"
                        placeholder="guild-slug"
                        value={joinSlug}
                        onChange={(e) => setJoinSlug(e.target.value)}
                        className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                      <Button type="submit" rightIcon={<ArrowRight className="h-4 w-4" />}>Continue</Button>
                    </form>
                  ) : null}
                </AppSection>

                <AppSection>
                  <SectionHeader
                    eyebrow="What changes"
                    title="The app now has explicit workspaces"
                    description="Instead of mixing admin, member and public surfaces into one navigation blob, each role gets a clear entry point."
                  />
                  <div className="mt-6 space-y-3 text-sm text-slate-300">
                    {[
                      'Officer workspace for setup, sync and publishing',
                      'Member workspace for registration and personal assignments',
                      'Visible mode switch when a user is both officer and member',
                      'Public boards remain shareable without exposing protected controls',
                    ].map((item) => (
                      <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">{item}</div>
                    ))}
                  </div>
                </AppSection>
              </div>
            ) : (
              <>
                <AppSection>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">Officer workspace</p>
                      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{guild.name}</h1>
                      <p className="mt-3 max-w-3xl text-sm text-slate-300">
                        Keep setup, sync health and published planning surfaces in one place. Members should only need the public board and their personal assignments.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge>{guild.slug ?? 'no slug'}</Badge>
                        <Badge variant={canManageGuild ? 'success' : 'neutral'}>{canManageGuild ? 'Manage access' : 'Read only'}</Badge>
                        {activeTb ? <Badge variant="info">{activeTb.name}</Badge> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={handleSync} disabled={!canManageGuild || !guild.id || syncing} isLoading={syncing} leftIcon={<RefreshCw className="h-4 w-4" />}>
                        Sync roster
                      </Button>
                      <Link href={routes.guildSettings()}><Button variant="secondary" leftIcon={<Settings className="h-4 w-4" />}>Guild setup</Button></Link>
                    </div>
                  </div>
                </AppSection>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricTile label="Guild members" value={guild.memberCount} detail="Imported member records" tone="info" />
                  <MetricTile label="Rostered members" value={guild.rosteredMembers} detail="Members with synced rosters" tone="success" />
                  <MetricTile label="Roster health" value={rosterState.label} detail={rosterState.detail} tone={rosterState.tone === 'good' ? 'success' : rosterState.tone === 'warn' ? 'warning' : 'danger'} />
                  <MetricTile label="Coverage" value={`${rosterCoveragePercent}%`} detail={strategicReadiness?.reference?.name ?? 'Reference data pending'} tone="neutral" />
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <AppSection>
                    <SectionHeader eyebrow="Operational status" title="Data readiness" description="Use this panel to judge whether your planner output is trustworthy before you publish links to the guild." />
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-sm font-medium text-slate-400">Last roster sync</div>
                        <div className="mt-3 text-lg font-semibold text-white">{formatDateTime(lastRosterSync)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-sm font-medium text-slate-400">Reference dataset</div>
                        <div className="mt-3 text-lg font-semibold text-white">{strategicReadiness?.reference?.name ?? 'Not available'}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-sm font-medium text-slate-400">SWGOH.GG ID</div>
                        <div className="mt-3 font-mono text-lg font-semibold text-white">{guild.swgoh_gg_id ?? 'Not connected'}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-sm font-medium text-slate-400">Recommended next step</div>
                        <div className="mt-3 text-sm text-slate-300">{rosterState.tone === 'good' ? 'Planning data looks healthy enough to publish.' : 'Run a roster sync before relying on the planner output.'}</div>
                      </div>
                    </div>
                    {syncStatus ? (
                      <div className="mt-6 rounded-2xl border border-blue-900/70 bg-blue-950/30 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm font-medium text-blue-100">{syncStatus.msg}</span>
                          <span className="text-xs text-blue-200/80">{syncStatus.total > 0 ? `${syncStatus.current}/${syncStatus.total}` : 'Preparing'}</span>
                        </div>
                        {syncStatus.total > 0 ? (
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, (syncStatus.current / syncStatus.total) * 100))}%` }} />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </AppSection>

                  <AppSection>
                    <SectionHeader eyebrow="Publish and share" title="Guild-facing surfaces" description="These links are what your guild should actually use. Keep the protected workspace for setup and officer actions." />
                    <div className="mt-6 space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-sm font-medium text-white">Public matching board</div>
                        <p className="mt-1 text-sm text-slate-400">Read-only board for coverage, gaps and guild-wide visibility.</p>
                        <div className="mt-4">{publicMatchingHref ? <Link href={publicMatchingHref} target="_blank"><Button variant="secondary" fullWidth leftIcon={<ExternalLink className="h-4 w-4" />}>Open matching</Button></Link> : <div className="text-sm text-slate-500">Set a guild slug first.</div>}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-sm font-medium text-white">Public simulator</div>
                        <p className="mt-1 text-sm text-slate-400">Planning surface for officers, exports and review outside the main dashboard.</p>
                        <div className="mt-4">{publicSimulatorHref ? <Link href={publicSimulatorHref} target="_blank"><Button variant="secondary" fullWidth leftIcon={<ExternalLink className="h-4 w-4" />}>Open simulator</Button></Link> : <div className="text-sm text-slate-500">Set a guild slug first.</div>}</div>
                      </div>
                      {activeTb ? (
                        <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-4">
                          <div className="text-sm font-medium text-white">Live planner</div>
                          <p className="mt-1 text-sm text-slate-400">Jump straight into the active Territory Battle execution surface.</p>
                          <div className="mt-4"><Link href={routes.livePlanner(activeTb.id)}><Button fullWidth>Open live planner</Button></Link></div>
                        </div>
                      ) : null}
                    </div>
                  </AppSection>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <AppSection>
                    <SectionHeader eyebrow="Planner signal" title="Most open units" description="Counts below come from the same live matching coverage as the public board cards." />
                    <div className="mt-6 space-y-3">
                      {(strategicReadiness?.topMissingUnits?.length ? strategicReadiness.topMissingUnits.slice(0, 5) : []).map((unit) => (
                        <div key={unit.unitName} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-white">{unit.unitName}</div>
                            <Badge variant="warning">{unit.missingSlots} open slots</Badge>
                          </div>
                          {unit.reasonSummary ? <div className="mt-2 text-sm text-slate-400">{unit.reasonSummary}</div> : null}
                        </div>
                      ))}
                      {!strategicReadiness?.topMissingUnits?.length ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">No missing-unit summary is available yet.</div> : null}
                    </div>
                  </AppSection>

                  <AppSection>
                    <SectionHeader eyebrow="Planner signal" title="Most open scopes" description="These open-slot counts now match the live coverage cards on the public board." />
                    <div className="mt-6 space-y-3">
                      {(strategicReadiness?.zones?.length ? strategicReadiness.zones.slice(0, 4) : []).map((zone) => (
                        <div key={`${zone.phase}-${zone.zoneName}`} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium text-white">Phase {zone.phase} · {zone.zoneName}</div>
                              <div className="mt-1 text-sm text-slate-400">{zone.blockers?.length ? `Top blockers: ${zone.blockers.join(', ')}` : 'No repeated blocker yet'}</div>
                            </div>
                            <Badge variant="warning">{zone.missingSlots} open slots</Badge>
                          </div>
                        </div>
                      ))}
                      {!strategicReadiness?.zones?.length ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">Zone readiness data is not available yet.</div> : null}
                    </div>
                  </AppSection>
                </div>
              </>
            )}

            <AppSection className="border-rose-900/70 bg-rose-950/20">
              <SectionHeader eyebrow="Danger zone" title="Irreversible actions" description="Keep destructive actions isolated from routine workspace controls." />
              <div className="mt-5">
                {noGuildConnected ? (
                  <form action="/api/account/delete" method="post">
                    <Button variant="danger" type="submit">Delete account</Button>
                  </form>
                ) : (
                  <div>
                    <Button variant="danger" disabled>Delete account</Button>
                    <p className="mt-3 text-sm text-slate-400">Delete the connected guild first before removing the account.</p>
                  </div>
                )}
              </div>
            </AppSection>
          </div>
        )}
      </AppContainer>
    </AppShell>
  );
}
