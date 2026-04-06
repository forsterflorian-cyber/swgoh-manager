import { notFound } from 'next/navigation';
import { sql } from '@vercel/postgres';

import { AppContainer, AppShell } from '@/components/app/AppShell';
import { MeineZuweisungenView } from '@/components/guild/meine-zuweisungen-view';
import { Navbar } from '@/components/layout/Navbar';
import { WorkspaceHeader } from '@/components/workspace/WorkspacePrimitives';
import { Badge } from '@/components/ui/Badge';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { loadMyAssignmentsForGuild } from '@/lib/services/my-assignments';

export const runtime = 'nodejs';

export default async function MeineZuweisungenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await sql<{ id: string; name: string }>`SELECT id, name FROM guilds WHERE slug = ${slug} LIMIT 1`;

  if (result.rows.length === 0) {
    notFound();
  }

  const guild = result.rows[0];
  const user = await getAuthenticatedUser();

  let initialSessionState: 'authenticated' | 'unauthenticated' = user ? 'authenticated' : 'unauthenticated';
  let initialData = null;
  let initialError: string | null = null;

  if (user) {
    const loadResult = await loadMyAssignmentsForGuild(user.id, guild.id);
    if (loadResult.ok) {
      initialData = loadResult.data;
    } else if (loadResult.status === 403) {
      initialError = 'not_registered';
    } else if (loadResult.status === 422) {
      initialError = 'relogin';
    } else {
      initialError = loadResult.error;
    }
  }

  return (
    <AppShell>
      <Navbar />
      <AppContainer>
        <div className="space-y-6">
          <WorkspaceHeader
            eyebrow="Member workspace"
            title={`My assignments · ${guild.name}`}
            description="This page should answer one question quickly: what am I expected to contribute right now? Assignments stay primary, upgrade targets stay complete, and navigation stays out of the way."
            badges={<><Badge variant="success">Task workspace</Badge><Badge>Personal view</Badge></>}
          />

          <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/20">
            <MeineZuweisungenView
              guildId={guild.id}
              guildName={guild.name}
              guildSlug={slug}
              initialSessionState={initialSessionState}
              initialData={initialData}
              initialError={initialError}
            />
          </div>
        </div>
      </AppContainer>
    </AppShell>
  );
}
