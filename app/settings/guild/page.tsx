
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Navbar } from '@/components/layout/Navbar';
import { GuildSettingsForm } from '@/components/guild/guild-settings-form';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-4xl px-4 py-10">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
              Guild Settings
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Connect a guild</h1>
            <p className="mt-3 text-sm text-gray-400">
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
              <Card variant="highlight">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Step 1</div>
                <div className="mt-2 text-lg font-medium text-white">Connect guild</div>
                <p className="mt-2 text-sm text-gray-400">
                  Set guild ID and public slug.
                </p>
              </Card>

              <Card variant="highlight">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Step 2</div>
                <div className="mt-2 text-lg font-medium text-white">Sync roster</div>
                <p className="mt-2 text-sm text-gray-400">
                  Import members and roster data.
                </p>
              </Card>

              <Card variant="highlight">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Step 3</div>
                <div className="mt-2 text-lg font-medium text-white">Plan and manage</div>
                <p className="mt-2 text-sm text-gray-400">
                  Use public matching and simulator.
                </p>
              </Card>
            </div>

            <Link href="/dashboard" className="mt-8 inline-block">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  if (!isGuildManagerRole(guild.role)) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar guildName={guild.name} guildSlug={guild.slug} />
        <div className="mx-auto max-w-4xl px-4 py-10">
          <section className="rounded-3xl border border-red-900 bg-red-950/25 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">
              403
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Forbidden</h1>
            <p className="mt-3 text-sm text-red-100/90">
              Only guild owners, admins, and officers can change the guild ID or slug.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
            >
              Back to dashboard
            </Link>
          </section>
        </div>
      </div>
    );
  }

  const publicMatchingHref = guild.slug ? `${appBaseUrl}/public/guild/${guild.slug}/matching` : null;
  const publicSimulatorHref = guild.slug ? `${appBaseUrl}/public/guild/${guild.slug}/simulator` : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar guildName={guild.name} guildSlug={guild.slug} canManageGuild />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
            Guild Settings
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Guild Settings</h1>
          <p className="mt-3 text-sm text-gray-400">
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
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
              Public Surfaces
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">Shared links</h2>
            <div className="mt-5 space-y-4 text-sm">
              <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-4">
                <div className="font-medium text-white">Matching</div>
                <div className="mt-1 text-gray-400">
                  Read-only public status board for coverage and gaps.
                </div>
                <div className="mt-4">
                  {publicMatchingHref ? (
                    <a
                      href={publicMatchingHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
                    >
                      Open matching
                    </a>
                  ) : (
                    <div className="text-gray-500">Set a slug first.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-4">
                <div className="font-medium text-white">Simulator</div>
                <div className="mt-1 text-gray-400">
                  Public planning surface for officers and exports.
                </div>
                <div className="mt-4">
                  {publicSimulatorHref ? (
                    <a
                      href={publicSimulatorHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
                    >
                      Open simulator
                    </a>
                  ) : (
                    <div className="text-gray-500">Set a slug first.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {rosterStats !== null && (
            <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
                Roster Sync
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">
                {rosterStats.membersSynced > 0 ? 'Roster data available' : 'No roster data yet'}
              </h2>
              <div className="mt-4 flex flex-wrap gap-6 text-sm text-gray-400">
                <span>
                  <span className="font-medium text-white">{rosterStats.membersSynced}</span>
                  {' / '}
                  <span>{rosterStats.totalMembersEligible}</span>
                  {' members synced'}
                </span>
                <span>
                  <span className="font-medium text-white">
                    {rosterStats.totalRosterRows.toLocaleString('en-US')}
                  </span>
                  {' roster rows'}
                </span>
                <span>
                  {'Last synced '}
                  <span className="font-medium text-white">
                    {formatLastSynced(rosterStats.lastSyncedAt)}
                  </span>
                </span>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                The working sync flow stays here in Guild Settings. Dashboard only shows the status.
              </p>
            </div>
          )}
        </section>

        {members.length > 0 && (
          <section className="mt-6 rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
              Guild Roster
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">
              {members.length} Members
            </h2>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="pb-3 pr-6">Name</th>
                    <th className="pb-3 pr-6">Ally Code</th>
                    <th className="pb-3 text-right">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {members.map((m, i) => (
                    <tr key={i} className="text-gray-300 hover:bg-gray-800/30">
                      <td className="py-2.5 pr-6 font-medium text-white">{m.playerName}</td>
                      <td className="py-2.5 pr-6 font-mono text-gray-400">
                        {m.allyCode ?? '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        {m.allyCode ? (
                          <a
                            href={`https://swgoh.gg/p/${m.allyCode.replace(/-/g, '')}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <span>View profile</span>
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-6 rounded-3xl border border-rose-900/70 bg-rose-950/20 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-200">
            Danger Zone
          </p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
            Delete guild configuration
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-rose-100/90">
            Delete the guild configuration, remove guild-specific synced data, and unlink the current
            user from this guild so a new guild can be connected cleanly afterwards.
          </p>

          <form action={`/api/guild/${guild.id}/delete`} method="post" className="mt-6">
            <button
              type="submit"
              className="inline-flex rounded-xl border border-rose-700 bg-rose-950/50 px-4 py-3 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-900/50"
            >
              Delete guild
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
