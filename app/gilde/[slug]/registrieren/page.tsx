import { notFound } from 'next/navigation';
import { sql } from '@vercel/postgres';

import { RegistrierungForm } from '@/components/guild/registrierung-form';
import { Navbar } from '@/components/layout/Navbar';
import { AppShell } from '@/components/layout/AppShell';
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader';
import { WorkspaceMetric, WorkspacePanel } from '@/components/workspace/WorkspacePanel';
import { routes } from '@/lib/utils/routes';

export const runtime = 'nodejs';

export default async function RegistrierungPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const result = await sql<{ id: string; name: string }>`
    SELECT id, name FROM guilds WHERE slug = ${slug} LIMIT 1
  `;

  if (result.rows.length === 0) {
    notFound();
  }

  const guild = result.rows[0];
  const tabs = [
    { href: routes.publicGuildBoard(slug), label: 'Guild board' },
    { href: routes.guildRegistration(slug), label: 'Registration', active: true },
    { href: routes.guildAssignments(slug), label: 'My assignments' },
    { href: routes.publicMatching(slug), label: 'Matching' },
    { href: routes.publicSimulator(slug), label: 'Planner' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <WorkspaceHeader
        backHref={routes.publicGuildBoard(slug)}
        backLabel={guild.name}
        eyebrow="Member workspace"
        title="Register your player profile"
        description="Link your Discord account to your SWGOH ally code once. After that, your assignments and upgrade guidance open as part of the same member flow."
        chips={
          <>
            <span className="rounded-full border border-emerald-900/70 bg-emerald-950/30 px-3 py-1 text-xs font-medium text-emerald-300">
              One-time setup
            </span>
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300">
              Guild: {guild.name}
            </span>
          </>
        }
        tabs={tabs}
      />

      <AppShell width="6xl" className="py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_22rem]">
          <WorkspacePanel
            title="Member setup"
            description="Use the ally code of the roster that belongs to this guild. If roster sync has already run, the account will match automatically."
          >
            <RegistrierungForm guildId={guild.id} guildName={guild.name} guildSlug={slug} />
          </WorkspacePanel>

          <div className="space-y-6">
            <WorkspacePanel
              title="What happens next"
              description="The member flow should feel guided, not like a form dropped onto a page."
              tone="info"
            >
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-sm font-medium text-white">1. Register once</div>
                  <div className="mt-1 text-sm text-slate-400">Connect your ally code to this guild.</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-sm font-medium text-white">2. Open assignments</div>
                  <div className="mt-1 text-sm text-slate-400">See published platoon placements and role-specific work.</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-sm font-medium text-white">3. Review upgrade guidance</div>
                  <div className="mt-1 text-sm text-slate-400">Use the member board for missing units and future relic targets.</div>
                </div>
              </div>
            </WorkspacePanel>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <WorkspaceMetric label="Flow" value="Member" detail="Focused on one player, not officer controls" />
              <WorkspaceMetric label="Setup" value="1 step" detail="Discord account + ally code mapping" />
              <WorkspaceMetric label="After setup" value="Live" detail="Assignments and matching stay in sync" />
            </div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}
