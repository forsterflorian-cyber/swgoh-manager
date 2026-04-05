import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Surface, Eyebrow } from '@/components/ui/Surface';
import { routes } from '@/lib/utils/routes';

import type { DashboardGuild, DashboardTb } from '../_lib/types';

function SurfaceLinkCard({
  title,
  detail,
  href,
  cta,
  emphasis = false,
}: {
  title: string;
  detail: string;
  href: string | null;
  cta: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasis ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-slate-800 bg-slate-950/60'}`}>
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="mt-1 text-sm text-slate-400">{detail}</div>
      </div>
      <div className="mt-4">
        {href ? (
          <Link href={href} target="_blank" rel="noreferrer">
            <Button variant={emphasis ? 'primary' : 'secondary'} fullWidth>
              {cta}
            </Button>
          </Link>
        ) : (
          <div className="text-sm text-slate-500">Set a guild slug first.</div>
        )}
      </div>
    </div>
  );
}

export function PublicSurfacesPanel({ guild, activeTb }: { guild: DashboardGuild; activeTb: DashboardTb | null }) {
  const publicMatchingHref = guild.slug ? routes.publicMatching(guild.slug) : null;
  const publicSimulatorHref = guild.slug ? routes.publicSimulator(guild.slug) : null;
  const guildBoardHref = guild.slug ? routes.publicGuildBoard(guild.slug) : null;

  return (
    <Surface className="animate-fade-in">
      <Eyebrow>Published views</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">What your guild can open</h2>
      <p className="mt-2 text-sm text-slate-400">
        These are the member-facing entry points. Keep them simple, shareable and consistent.
      </p>

      <div className="mt-6 space-y-4">
        <SurfaceLinkCard title="Guild board" detail="Public landing page for assignments and overview" href={guildBoardHref} cta="Open guild board" />
        <SurfaceLinkCard title="Matching board" detail="Read-only bottlenecks and coverage across the guild" href={publicMatchingHref} cta="Open matching" />
        <SurfaceLinkCard title="Planner" detail="Published planning surface for shared guild visibility" href={publicSimulatorHref} cta="Open planner" />

        {activeTb ? (
          <SurfaceLinkCard
            title="Live planner"
            detail={`Current Territory Battle instance: ${activeTb.name}`}
            href={routes.livePlanner(activeTb.id)}
            cta="Open live planner"
            emphasis
          />
        ) : null}
      </div>
    </Surface>
  );
}
