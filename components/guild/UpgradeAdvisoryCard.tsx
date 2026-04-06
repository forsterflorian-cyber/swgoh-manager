import { Badge } from '@/components/ui/Badge';

export type UpgradeAdvisoryPriority = 'top' | 'good' | 'longterm';

export type UpgradeAdvisoryPhaseImpact = {
  phase: number;
  category: string;
  slotsAdded: number;
};

function PriorityBadge({ priority }: { priority: UpgradeAdvisoryPriority }) {
  const styles = {
    top: 'border-amber-700 bg-amber-950/40 text-amber-200',
    good: 'border-blue-700 bg-blue-950/40 text-blue-200',
    longterm: 'border-white/10 bg-white/[0.03] text-slate-300',
  } as const;
  const labels = { top: 'Top priority', good: 'Good target', longterm: 'Long-term' } as const;
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[priority]}`}>{labels[priority]}</span>;
}

export function UpgradeAdvisoryCard({
  unitName,
  currentRelic,
  recommendedRelic,
  priority,
  slotsUnlocked,
  affectedPhases,
  estimatedCost,
  impactScore,
  className = '',
}: {
  unitName: string;
  currentRelic: number;
  recommendedRelic: number;
  priority: UpgradeAdvisoryPriority;
  slotsUnlocked: number;
  affectedPhases: UpgradeAdvisoryPhaseImpact[];
  estimatedCost?: number;
  impactScore?: number;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">{unitName}</div>
          <div className="mt-1 text-xs text-slate-500">R{currentRelic} → R{recommendedRelic}</div>
        </div>
        <PriorityBadge priority={priority} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">+{slotsUnlocked} slots unlocked</span>
        {affectedPhases.map((phase, index) => (
          <span key={`${phase.phase}-${phase.category}-${index}`} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
            P{phase.phase} {phase.category} +{phase.slotsAdded}
          </span>
        ))}
      </div>
      {(typeof estimatedCost === 'number' || typeof impactScore === 'number') ? (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
          {typeof estimatedCost === 'number' ? <span>~{estimatedCost} relic mat</span> : null}
          {typeof impactScore === 'number' ? <span>Score {impactScore}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
