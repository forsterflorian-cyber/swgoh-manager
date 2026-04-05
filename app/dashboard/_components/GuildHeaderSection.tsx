import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Surface, Eyebrow } from '@/components/ui/Surface';
import { routes } from '@/lib/utils/routes';

import type { DashboardGuild, DashboardTb } from '../_lib/types';

export function GuildHeaderSection({
  guild,
  activeTb,
  canManageGuild,
  syncing,
  onSync,
}: {
  guild: DashboardGuild;
  activeTb: DashboardTb | null;
  canManageGuild: boolean;
  syncing: boolean;
  onSync: () => void;
}) {
  return (
    <Surface className="mb-8 animate-fade-in overflow-hidden p-0" tone="info">
      <div className="border-b border-blue-900/60 bg-gradient-to-br from-indigo-950/80 via-slate-950 to-slate-950 px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Eyebrow className="text-indigo-300">Officer workspace</Eyebrow>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{guild.name}</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-300">
              Keep guild data current, publish public planning surfaces and manage the operational state before Territory Battle starts.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Badge variant="neutral">{guild.slug ?? 'no slug'}</Badge>
              <Badge variant={canManageGuild ? 'success' : 'neutral'}>
                {canManageGuild ? 'Manage access' : 'Read only'}
              </Badge>
              {activeTb ? <Badge variant="info">{activeTb.name}</Badge> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[24rem]">
            <Button onClick={onSync} disabled={!canManageGuild || !guild.id || syncing} isLoading={syncing} size="lg">
              {syncing ? 'Syncing roster...' : 'Sync roster'}
            </Button>
            <Link href={routes.guildSettings()}>
              <Button variant="secondary" size="lg" fullWidth>Guild settings</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-5 sm:px-8 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Workspace</div>
          <div className="mt-2 text-sm font-medium text-white">Guild operations</div>
          <div className="mt-1 text-sm text-slate-400">Sync, readiness and publishing live in one place.</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Current TB</div>
          <div className="mt-2 text-sm font-medium text-white">{activeTb?.name ?? 'No active instance'}</div>
          <div className="mt-1 text-sm text-slate-400">Open the live planner when a Territory Battle instance is active.</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Public access</div>
          <div className="mt-2 text-sm font-medium text-white">{guild.slug ? 'Ready to share' : 'Needs slug'}</div>
          <div className="mt-1 text-sm text-slate-400">Public board, matching and member views depend on a stable guild slug.</div>
        </div>
      </div>
    </Surface>
  );
}
