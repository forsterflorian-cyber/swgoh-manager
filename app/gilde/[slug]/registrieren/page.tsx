import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@vercel/postgres';

import { AppContainer, AppShell } from '@/components/app/AppShell';
import { Navbar } from '@/components/layout/Navbar';
import { RegistrierungForm } from '@/components/guild/registrierung-form';
import { WorkspaceHeader, WorkspaceTabs } from '@/components/workspace/WorkspacePrimitives';
import { Badge } from '@/components/ui/Badge';
import { routes } from '@/lib/utils/routes';

export const runtime = 'nodejs';

export default async function RegistrierungPage({ params }: { params: Promise<{ slug: string }> }) {
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
            title={`Register for ${guild.name}`}
            description="Link your Discord identity to the correct ally code once. After that, your personal assignment view and upgrade hints can resolve against your synced roster."
            badges={<><Badge variant="info">Guild slug: {slug}</Badge><Badge>Identity step</Badge></>}
          />

          <WorkspaceTabs
            currentPath={routes.registration(slug)}
            tabs={[
              { href: routes.registration(slug), label: 'Registration', hint: 'Link your ally code' },
              { href: routes.assignments(slug), label: 'My assignments', hint: 'View personal tasks' },
              { href: routes.publicGuild(slug), label: 'Guild board', hint: 'Read-only public overview' },
            ]}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/20">
              <RegistrierungForm guildId={guild.id} guildName={guild.name} guildSlug={slug} />
            </div>

            <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/20">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">What happens next</p>
              <h2 className="mt-3 text-xl font-semibold">After registration</h2>
              <div className="mt-5 space-y-3 text-sm text-slate-300">
                {[
                  'Your Discord account maps to the matching guild member record.',
                  'The app can show your personal platoon assignments without asking for an ally code again.',
                  'Upgrade hints only make sense once roster data has been synced by guild leadership.',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">{item}</div>
                ))}
              </div>
              <div className="mt-6">
                <Link href={routes.publicGuild(slug)} className="text-sm text-slate-400 hover:text-white">
                  Open guild board instead
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AppContainer>
    </AppShell>
  );
}
