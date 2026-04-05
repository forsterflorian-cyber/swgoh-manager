import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Surface } from '@/components/ui/Surface';
import { routes } from '@/lib/utils/routes';

import type { DashboardGuild, DashboardTb } from '../_lib/types';

function SurfaceLinkCard({
  title,
  detail,
  href,
  cta,
  tone = 'secondary',
}: {
  title: string;
  detail: string;
  href: string | null;
  cta: string;
  tone?: 'primary' | 'secondary';
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-primary)] p-4">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-[var(--color-text-muted)]">{detail}</div>
      </div>
      <div className="mt-4">
        {href ? (
          <Link href={href} target="_blank" rel="noreferrer">
            <Button variant={tone} fullWidth>
              {cta}
            </Button>
          </Link>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">Set a slug first.</div>
        )}
      </div>
    </div>
  );
}

export function PublicSurfacesPanel({ guild, activeTb }: { guild: DashboardGuild; activeTb: DashboardTb | null }) {
  const publicMatchingHref = guild.slug ? routes.publicMatching(guild.slug) : null;
  const publicSimulatorHref = guild.slug ? routes.publicSimulator(guild.slug) : null;

  return (
    <Surface className="animate-fade-in">
      <h2 className="text-xl font-semibold">Public surfaces</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Share planning tools with your guild.</p>

      <div className="mt-6 space-y-4">
        <SurfaceLinkCard title="Public matching" detail="Read-only status board" href={publicMatchingHref} cta="Open matching" />
        <SurfaceLinkCard title="Public simulator" detail="Officer planning tool" href={publicSimulatorHref} cta="Open simulator" />

        {activeTb ? (
          <div className="rounded-xl border border-[var(--color-accent-emerald)] p-4 card-glow-emerald">
            <div>
              <div className="font-medium">Live planner</div>
              <div className="text-xs text-[var(--color-text-muted)]">Active: {activeTb.name}</div>
            </div>
            <div className="mt-4">
              <Link href={routes.livePlanner(activeTb.id)}>
                <Button fullWidth>Open live planner</Button>
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </Surface>
  );
}
