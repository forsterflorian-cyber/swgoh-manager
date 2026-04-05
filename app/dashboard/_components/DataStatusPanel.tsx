import { formatDateTime } from '@/lib/utils/format-date';
import { Surface } from '@/components/ui/Surface';

import { getProgressColor } from '../_lib/dashboard-client';
import type { DashboardGuild, DashboardStrategicReadiness, SyncStatus } from '../_lib/types';

function ProgressPanel({ syncStatus }: { syncStatus: SyncStatus }) {
  const progressPercent =
    syncStatus.total > 0 ? Math.min(100, Math.max(0, (syncStatus.current / syncStatus.total) * 100)) : 0;

  return (
    <div className="mt-6 rounded-xl border border-[var(--color-accent-blue)] bg-[rgb(59_130_246_/_0.1)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--color-accent-blue)]">{syncStatus.msg}</span>
        <span className="text-sm text-[var(--color-text-muted)]">
          {syncStatus.total > 0 ? `${syncStatus.current}/${syncStatus.total}` : 'Preparing…'}
        </span>
      </div>
      {syncStatus.total > 0 ? (
        <div className="mt-3 progress-bar">
          <div className="progress-fill progress-fill-blue" style={{ width: `${progressPercent}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function DataStatusPanel({
  guild,
  strategicReadiness,
  lastRosterSync,
  rosterCoveragePercent,
  syncStatus,
}: {
  guild: DashboardGuild;
  strategicReadiness: DashboardStrategicReadiness | null;
  lastRosterSync: string | null;
  rosterCoveragePercent: number;
  syncStatus: SyncStatus | null;
}) {
  return (
    <Surface className="animate-fade-in">
      <h2 className="text-xl font-semibold">Data status</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Keep guild membership and roster data up to date.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="stat-card">
          <div className="stat-label">Last roster sync</div>
          <div className="stat-value text-lg">{formatDateTime(lastRosterSync)}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Reference dataset</div>
          <div className="stat-value text-lg">{strategicReadiness?.reference?.name ?? 'Not available'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">SWGOH.GG ID</div>
          <div className="stat-value text-lg font-mono">{guild.swgoh_gg_id ?? 'Not connected'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Roster coverage</div>
          <div className="stat-value text-lg">{rosterCoveragePercent}%</div>
          <div className="progress-bar mt-2">
            <div
              className={`progress-fill ${getProgressColor(rosterCoveragePercent)}`}
              style={{ width: `${rosterCoveragePercent}%` }}
            />
          </div>
        </div>
      </div>

      {syncStatus ? <ProgressPanel syncStatus={syncStatus} /> : null}
    </Surface>
  );
}
