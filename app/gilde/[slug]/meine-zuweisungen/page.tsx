import { notFound } from 'next/navigation';
import { sql } from '@vercel/postgres';

import { MeineZuweisungenView } from '@/components/guild/meine-zuweisungen-view';
import { Navbar } from '@/components/layout/Navbar';
import { AppShell } from '@/components/layout/AppShell';
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader';
import { routes } from '@/lib/utils/routes';

export const runtime = 'nodejs';

export default async function MeineZuweisungenPage({
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
    { href: routes.guildRegistration(slug), label: 'Registration' },
    { href: routes.guildAssignments(slug), label: 'My assignments', active: true },
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
        title="Your live TB assignments"
        description="This view is for one member: what to place now, what to improve next and whether roster sync is current enough to trust the results."
        chips={
          <>
            <span className="rounded-full border border-indigo-900/70 bg-indigo-950/30 px-3 py-1 text-xs font-medium text-indigo-300">
              Personal view
            </span>
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300">
              Guild: {guild.name}
            </span>
          </>
        }
        tabs={tabs}
      />

      <AppShell width="6xl" className="py-8">
        <MeineZuweisungenView guildId={guild.id} guildName={guild.name} guildSlug={slug} />
      </AppShell>
    </div>
  );
}
