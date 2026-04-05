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
    <Surface className="mb-8 animate-fade-in" tone="info">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Eyebrow>Guild configuration</Eyebrow>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{guild.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge variant="neutral">{guild.slug ?? 'no slug'}</Badge>
            <Badge variant={canManageGuild ? 'success' : 'neutral'}>
              {canManageGuild ? '✓ Manage access' : '○ Read only'}
            </Badge>
            {activeTb ? <Badge variant="info">{activeTb.name}</Badge> : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={onSync} disabled={!canManageGuild || !guild.id || syncing} isLoading={syncing}>
            {syncing ? 'Syncing...' : 'Sync roster'}
          </Button>
          <Link href={routes.guildSettings()}>
            <Button variant="secondary">Settings</Button>
          </Link>
        </div>
      </div>
    </Surface>
  );
}
