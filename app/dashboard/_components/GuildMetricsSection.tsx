import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';

import { getProgressColor } from '../_lib/dashboard-client';
import type { DashboardGuild, RosterState } from '../_lib/types';

export function GuildMetricsSection({
  guild,
  rosterState,
  rosterCoveragePercent,
}: {
  guild: DashboardGuild;
  rosterState: RosterState;
  rosterCoveragePercent: number;
}) {
  const rosterTone = rosterState.tone === 'good' ? 'success' : rosterState.tone === 'warn' ? 'warning' : 'danger';

  return (
    <section className="mb-8 grid gap-6 md:grid-cols-3">
      <StatCard title="Guild members" value={guild.memberCount} detail="Imported guild members" tone="info" />
      <StatCard title="Rostered members" value={guild.rosteredMembers} detail="Members with synced roster data" tone="success" />
      <StatCard
        title="Roster status"
        value={<Badge variant={rosterTone}>{rosterState.label}</Badge>}
        detail={
          <div>
            <div className="progress-bar mt-2">
              <div
                className={`progress-fill ${getProgressColor(rosterCoveragePercent)}`}
                style={{ width: `${rosterCoveragePercent}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-[var(--color-text-muted)]">{rosterState.detail}</div>
          </div>
        }
        tone={rosterTone}
      />
    </section>
  );
}
