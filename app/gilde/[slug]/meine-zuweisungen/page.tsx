import { notFound } from 'next/navigation';
import { sql } from '@vercel/postgres';

import { AppContainer, AppShell } from '@/components/app/AppShell';
import { MeineZuweisungenView } from '@/components/guild/meine-zuweisungen-view';
import { Navbar } from '@/components/layout/Navbar';
import { WorkspaceHeader, WorkspaceTabs } from '@/components/workspace/WorkspacePrimitives';
import { Badge } from '@/components/ui/Badge';
import { routes } from '@/lib/utils/routes';

export const runtime = 'nodejs';

export default async function MeineZuweisungenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await sql<{ id: string; name: string }>`SELECT id, name FROM guilds WHERE slug = ${slug} LIMIT 1`;

  if (result.rows.length === 0) {
    notFound();
  }

  const guild = result.rows[0];

  return (
    <AppShell>
      <Navbar />
      <AppContainer>
        <div className="space-y-6">
          <WorkspaceHeader
            eyebrow="Member workspace"
            title={`My assignments · ${guild.name}`}
            description="This page should answer one question quickly: what am I expected to contribute right now? Registration, assignments and upgrade advice stay in the same member flow."
            badges={<><Badge variant="success">Task workspace</Badge><Badge>Personal view</Badge></>}
          />

          <WorkspaceTabs
            currentPath={routes.assignments(slug)}
            tabs={[
              { href: routes.registration(slug), label: 'Registration', hint: 'Identity and ally code' },
              { href: routes.assignments(slug), label: 'My assignments', hint: 'Current platoon work' },
              { href: routes.publicGuild(slug), label: 'Guild board', hint: 'Shared read-only view' },
            ]}
          />

          <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/20">
            <MeineZuweisungenView guildId={guild.id} guildName={guild.name} guildSlug={slug} />
          </div>
        </div>
      </AppContainer>
    </AppShell>
  );
}
