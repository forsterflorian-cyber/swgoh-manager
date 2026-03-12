import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Navbar } from '@/components/layout/Navbar';
import { GuildSettingsForm } from '@/components/guild/guild-settings-form';
import { getAuthenticatedUser } from '@/lib/api/auth';
import {
  getPrimaryGuildSettingsForUser,
  isGuildManagerRole,
} from '@/lib/services/guild-settings';
import { getAppBaseUrl } from '@/lib/utils/base-url';

export default async function GuildSettingsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  const guild = await getPrimaryGuildSettingsForUser(user.id);
  const appBaseUrl = getAppBaseUrl();

  if (!guild) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-10">
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
        <div className="mx-auto max-w-3xl px-4 py-10">
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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar guildName={guild.name} guildSlug={guild.slug} canManageGuild />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
            Guild Settings
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Guild Settings</h1>
          <p className="mt-3 text-sm text-gray-400">
            Update the external guild ID and public slug used across the protected planner and the
            public target board.
          </p>

          <div className="mt-8">
            <GuildSettingsForm
              appBaseUrl={appBaseUrl}
              initialGuildId={guild.guildId ?? ''}
              initialSlug={guild.slug}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
