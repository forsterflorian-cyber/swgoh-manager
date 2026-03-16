import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Navbar } from '@/components/layout/Navbar';
import { GuildSettingsForm } from '@/components/guild/guild-settings-form';
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
          <section className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
              Guild Settings
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">No guild connected</h1>
            <p className="mt-3 text-sm text-gray-400">
              Connect a guild first before updating its public identifier and slug.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Back to dashboard
            </Link>
          </section>
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
                    <th className="pb-3 text-right">Galactic Power</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {members.map((m, i) => (
                    <tr key={i} className="text-gray-300 hover:bg-gray-800/30">
                      <td className="py-2.5 pr-6 font-medium text-white">{m.playerName}</td>
                      <td className="py-2.5 pr-6 font-mono text-gray-400">
                        {m.allyCode ?? '—'}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-gray-300">
                        {m.galacticPower.toLocaleString('en-US')}
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
            This action is intended to remove the guild configuration from the app and unlink the
            current user from that guild, so switching to another guild does not leave old guild
            bindings behind. Historical guild-specific app data should be removed together with the
            user-to-guild link.
          </p>

          <div className="mt-6 rounded-2xl border border-rose-900/60 bg-black/20 p-5">
            <div className="text-sm text-rose-100/90">
              Recommended backend behavior:
            </div>
            <ul className="mt-3 space-y-2 text-sm text-rose-100/80">
              <li>• remove the user ↔ guild association</li>
              <li>• remove stored guild config and slug</li>
              <li>• remove synced member and roster data for that guild</li>
              <li>• prevent old state from showing up after the user connects a new guild</li>
            </ul>
          </div>

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
