import { formatDateTime } from '@/lib/utils/format-date';
import { Surface, Eyebrow } from '@/components/ui/Surface';

import { getProgressColor } from '../_lib/dashboard-client';
import type { DashboardGuild, DashboardStrategicReadiness, SyncStatus } from '../_lib/types';

function ProgressPanel({ syncStatus }: { syncStatus: SyncStatus }) {
  const progressPercent =
    syncStatus.total > 0 ? Math.min(100, Math.max(0, (syncStatus.current / syncStatus.total) * 100)) : 0;

  return (
    <div className="mt-6 rounded-2xl border border-blue-900/60 bg-blue-950/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-blue-200">{syncStatus.msg}</span>
        <span className="text-sm text-slate-400">
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

function StatusTile({
  label,
  value,
  detail,
  progress,
}: {
  label: string;
  value: string;
  detail?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 text-lg font-semibold text-white">{value}</div>
      {detail ? <div className="mt-1 text-sm text-slate-400">{detail}</div> : null}
      {typeof progress === 'number' ? (
        <div className="progress-bar mt-4">
          <div className={`progress-fill ${getProgressColor(progress)}`} style={{ width: `${progress}%` }} />
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
      <Eyebrow>Data reliability</Eyebrow>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">Status of the guild dataset</h2>
      <p className="mt-2 text-sm text-slate-400">
        These values determine how trustworthy your matching, planner and assignment views are.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatusTile
          label="Last roster sync"
          value={formatDateTime(lastRosterSync)}
          detail="Refresh before publishing assignments or planning upgrades."
        />
        <StatusTile
          label="Reference dataset"
          value={strategicReadiness?.reference?.name ?? 'Not available'}
          detail="The current unit reference used for planning and readiness checks."
        />
        <StatusTile
          label="SWGOH.GG connection"
          value={guild.swgoh_gg_id ?? 'Not connected'}
          detail="Guild identifier used for imports and roster coverage."
        />
        <StatusTile
          label="Roster coverage"
          value={`${rosterCoveragePercent}%`}
          detail="Share of guild members with imported roster data."
          progress={rosterCoveragePercent}
        />
      </div>

      {syncStatus ? <ProgressPanel syncStatus={syncStatus} /> : null}
    </Surface>
  );
}
