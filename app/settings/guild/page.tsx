import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Navbar } from '@/components/layout/Navbar';
import { AppShell } from '@/components/layout/AppShell';
import { GuildSettingsForm } from '@/components/guild/guild-settings-form';
import { CopyDiscordButton } from '@/components/guild/copy-discord-button';
import { IgnoreMemberButton } from '@/components/guild/ignore-member-button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader';
import { getAuthenticatedUser } from '@/lib/api/auth';
import {
  getPrimaryGuildSettingsForUser,
  getGuildMemberList,
  getRosterSyncStats,
  isGuildManagerRole,
  type GuildMemberRow,
  type RosterSyncStats,
} from '@/lib/services/guild-settings';
import { getAppBaseUrl } from '@/lib/utils/base-url';

function formatLastSynced(value: string | Date | null) {
  if (!value) {
    return 'Never';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function GuildSettingsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  const guild = await getPrimaryGuildSettingsForUser(user.id);
  const appBaseUrl = getAppBaseUrl();
  const members: GuildMemberRow[] = guild ? await getGuildMemberList(guild.id) : [];
  const rosterStats: RosterSyncStats | null = guild ? await getRosterSyncStats(guild.id) : null;

  if (!guild) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-4xl px-6 py-10">
          <Card className="animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent-blue)]">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Guild Settings</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">Connect a guild</h1>
              </div>
            </div>
            
            <p className="mt-4 text-[var(--color-text-secondary)]">
              Add your SWGOH guild identifier and choose the public slug. After that you can sync
              members and roster data and start using matching and simulator.
            </p>

            <div className="mt-8">
              <GuildSettingsForm
                appBaseUrl={appBaseUrl}
                initialGuildId=""
                initialSlug={""}
              />
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="stat-card">
                <div className="stat-label">Step 1</div>
                <div className="mt-2 text-lg font-semibold">Connect guild</div>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  Set guild ID and public slug.
                </p>
              </div>

              <div className="stat-card">
                <div className="stat-label">Step 2</div>
                <div className="mt-2 text-lg font-semibold">Sync roster</div>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  Import members and roster data.
                </p>
              </div>

              <div className="stat-card">
                <div className="stat-label">Step 3</div>
                <div className="mt-2 text-lg font-semibold">Plan and manage</div>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  Use public matching and simulator.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <Link href="/dashboard">
                <Button variant="secondary">Back to dashboard</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!isGuildManagerRole(guild.role)) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-4xl px-6 py-10">
          <Card variant="danger" className="animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-rose)]">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <Badge variant="danger">403</Badge>
                <h2 className="mt-2 text-2xl font-bold">Forbidden</h2>
              </div>
            </div>
            <p className="mt-4 text-[var(--color-text-secondary)]">
              Only guild owners, admins, and officers can change the guild ID or slug.
            </p>
            <div className="mt-6">
              <Link href="/dashboard">
                <Button variant="secondary">Back to dashboard</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const publicMatchingHref = guild.slug ? `${appBaseUrl}/public/guild/${guild.slug}/matching` : null;
  const publicSimulatorHref = guild.slug ? `${appBaseUrl}/public/guild/${guild.slug}/simulator` : null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <WorkspaceHeader
        eyebrow="Officer workspace"
        title={`Guild settings · ${guild.name}`}
        description="Configure the connected guild, keep sync status trustworthy and manage the public surfaces members actually use."
        chips={
          <>
            <span className="rounded-full border border-indigo-900/70 bg-indigo-950/30 px-3 py-1 text-xs font-medium text-indigo-300">Officer setup</span>
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300">Public slug: {guild.slug || 'not set'}</span>
          </>
        }
        tabs={[
          { href: '/dashboard', label: 'Overview' },
          { href: '/settings/guild', label: 'Guild settings', active: true },
          ...(guild.slug ? [{ href: `/gilde/${guild.slug}`, label: 'Guild board' }] : []),
        ]}
      />
      <AppShell width="6xl" className="py-8">

        {/* Guild Configuration */}
        <Card className="mb-8 animate-fade-in">
          <div className="metric-label">Guild configuration</div>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            Update the external guild ID and public slug used across the protected config area and the
            public matching and simulator surfaces.
          </p>

          <div className="mt-8">
            <GuildSettingsForm
              appBaseUrl={appBaseUrl}
              initialGuildId={guild.guildId ?? ''}
              initialSlug={guild.slug}
            />
          </div>
        </Card>

        {/* Public Surfaces & Roster Sync */}
        <section className="mb-8 grid gap-6 lg:grid-cols-2">
          <Card className="animate-fade-in">
            <div className="metric-label">Public Surfaces</div>
            <h2 className="mt-3 text-xl font-semibold">Shared links</h2>
            <div className="mt-4">
              <CopyDiscordButton
                guildName={guild.name}
                matchingUrl={publicMatchingHref}
                simulatorUrl={publicSimulatorHref}
              />
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-blue)]">
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Matching</div>
                    <div className="text-sm text-[var(--color-text-muted)]">
                      Read-only public status board for coverage and gaps.
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  {publicMatchingHref ? (
                    <a href={publicMatchingHref} target="_blank" rel="noreferrer">
                      <Button variant="secondary" className="w-full">Open matching</Button>
                    </a>
                  ) : (
                    <div className="text-sm text-[var(--color-text-muted)]">Set a slug first.</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-purple)]">
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Simulator</div>
                    <div className="text-sm text-[var(--color-text-muted)]">
                      Public planning surface for officers and exports.
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  {publicSimulatorHref ? (
                    <a href={publicSimulatorHref} target="_blank" rel="noreferrer">
                      <Button variant="secondary" className="w-full">Open simulator</Button>
                    </a>
                  ) : (
                    <div className="text-sm text-[var(--color-text-muted)]">Set a slug first.</div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {rosterStats !== null && (
            <Card className="animate-fade-in">
              <div className="metric-label">Roster Sync</div>
              <h2 className="mt-3 text-xl font-semibold">
                {rosterStats.membersSynced > 0 ? 'Roster data available' : 'No roster data yet'}
              </h2>
              <div className="mt-4 space-y-3">
                <div className="stat-card">
                  <div className="stat-label">Members synced</div>
                  <div className="stat-value text-lg">
                    {rosterStats.membersSynced} / {rosterStats.totalMembersEligible}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Roster rows</div>
                  <div className="stat-value text-lg">
                    {rosterStats.totalRosterRows.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Last synced</div>
                  <div className="stat-value text-lg">
                    {formatLastSynced(rosterStats.lastSyncedAt)}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                The working sync flow stays here in Guild Settings. Dashboard only shows the status.
              </p>
            </Card>
          )}
        </section>

        {/* Guild Roster */}
        {members.length > 0 && (
          <Card className="mb-8 animate-fade-in">
            <div className="metric-label">Guild Roster</div>
            <h2 className="mt-3 text-xl font-semibold">{members.length} Members</h2>

            <div className="mt-6 table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Ally Code</th>
                    <th>Status</th>
                    <th>Profile</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                        <tr key={i} className={m.ignoredAt ? 'opacity-50' : ''}>
                          <td className="font-medium">
                            {m.playerName}
                            {m.ignoredAt && (
                              <Badge variant="warning" size="sm" className="ml-2">
                                Ignored
                              </Badge>
                            )}
                          </td>
                          <td className="font-mono text-[var(--color-text-muted)]">
                            {m.allyCode ?? '—'}
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {m.ignoredAt ? (
                                <Badge variant="warning">Ignored</Badge>
                              ) : (
                                <Badge variant="success">Active</Badge>
                              )}
                              {m.isRegistered && (
                                <Badge variant="info" size="sm">Discord</Badge>
                              )}
                            </div>
                          </td>
                          <td>
                            {m.allyCode ? (
                              <a
                                href={`https://swgoh.gg/p/${m.allyCode.replace(/-/g, '')}/`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[var(--color-accent-blue)] hover:underline"
                              >
                                <span>View profile</span>
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              <span className="text-[var(--color-text-muted)]">—</span>
                            )}
                          </td>
                          <td>
                            <IgnoreMemberButton
                              guildId={guild.id}
                              memberId={m.id}
                              memberName={m.playerName}
                              isIgnored={!!m.ignoredAt}
                            />
                          </td>
                        </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Danger Zone */}
        <Card variant="danger" className="animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-rose)]">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-rose)]">
                Danger Zone
              </p>
              <h2 className="mt-2 text-xl font-semibold">Delete guild configuration</h2>
            </div>
          </div>
          <p className="mt-4 text-[var(--color-text-secondary)]">
            Delete the guild configuration, remove guild-specific synced data, and unlink the current
            user from this guild so a new guild can be connected cleanly afterwards.
          </p>

          <form action={`/api/guild/${guild.id}/delete`} method="post" className="mt-6">
            <Button variant="danger">Delete guild</Button>
          </form>
        </Card>
      </AppShell>
    </div>
  );
}