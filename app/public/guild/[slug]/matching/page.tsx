import { notFound } from 'next/navigation';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import type { PlatoonMatchingGap, PlatoonMatchingResult } from '@/lib/types/platoon-readiness';

export const revalidate = 300;

type PageProps = {
  params: Promise<{ slug: string }>;
};

const GAP_ACTION_META: Record<
  PlatoonMatchingGap['recommendedAction'],
  { label: string; className: string }
> = {
  use_unused: {
    label: 'Use unused unit',
    className: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
  },
  upgrade: {
    label: 'Upgrade existing unit',
    className: 'border-amber-800 bg-amber-950/40 text-amber-300',
  },
  acquire: {
    label: 'Acquire or unlock unit',
    className: 'border-rose-800 bg-rose-950/40 text-rose-300',
  },
  reassign: {
    label: 'Reassignment needed',
    className: 'border-sky-800 bg-sky-950/40 text-sky-300',
  },
};

function CoverageCard({
  phase,
  category,
  assignedCount,
  requirementCount,
  coveragePercent,
  isBonus,
}: PlatoonMatchingResult['coverage'][number]) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">
            P{phase} · {isBonus ? 'Bonus' : category}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {assignedCount} / {requirementCount} assigned
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-white">{coveragePercent}%</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-900">
        <div
          className="h-full rounded-full bg-indigo-500"
          style={{ width: `${coveragePercent}%` }}
        />
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment,
}: {
  assignment: PlatoonMatchingResult['assignments'][number];
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">
              {assignment.unitName ?? assignment.unitBaseId}
            </span>
            <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-xs text-gray-400">
              P{assignment.phase} · {assignment.planetCategory ?? '?'}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {assignment.playerName} · {assignment.platoonKey} · Slot {assignment.slotNumber}
          </p>
        </div>
      </div>
    </div>
  );
}

function GapCard({ gap }: { gap: PlatoonMatchingGap }) {
  const meta = GAP_ACTION_META[gap.recommendedAction];

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">
              {gap.unitName ?? gap.unitBaseId}
            </span>
            <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-xs text-gray-400">
              P{gap.phase} · {gap.isBonus ? 'Bonus' : gap.planetCategory ?? '?'}
            </span>
            {gap.minRelic > 0 && (
              <span className="rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-xs text-gray-400">
                R{gap.minRelic}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {(gap.zoneName ?? gap.zoneKey) + ' · '}
            Platoon {gap.platoonNumber ?? '?'} · Slot {gap.slotNumber}
          </p>
        </div>

        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
          {meta.label}
        </span>
      </div>

      {gap.possibleSources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {gap.possibleSources.slice(0, 6).map((source) => (
            <span
              key={`${gap.requirementId}:${source.memberId}:${source.kind}`}
              className="rounded-full border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-400"
            >
              {source.playerName}
              {source.kind === 'near_miss' &&
                ` · -${source.missingRelicTiers ?? 0} relic / -${source.missingRarity ?? 0}★`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function PublicGuildMatchingPage({ params }: PageProps) {
  const { slug } = await params;

  const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

  if (!dataset.guild || !dataset.reference) {
    notFound();
  }

  const matching = computePlatoonMatching(dataset);

  const sortedCoverage = [...matching.coverage].sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;
    if ((a.isBonus ? 1 : 0) !== (b.isBonus ? 1 : 0)) return Number(a.isBonus) - Number(b.isBonus);
    return String(a.category).localeCompare(String(b.category));
  });

const sortedAssignments = [...matching.assignments].sort((a, b) => {
  if (a.phase !== b.phase) return a.phase - b.phase;

  const leftPlatoonKey = a.platoonKey ?? '';
  const rightPlatoonKey = b.platoonKey ?? '';
  if (leftPlatoonKey !== rightPlatoonKey) {
    return leftPlatoonKey.localeCompare(rightPlatoonKey);
  }

  if (a.slotNumber !== b.slotNumber) return a.slotNumber - b.slotNumber;

  const leftUnitName = a.unitName ?? a.unitBaseId;
  const rightUnitName = b.unitName ?? b.unitBaseId;
  return leftUnitName.localeCompare(rightUnitName);
});

const sortedGaps = [...matching.gaps].sort((a, b) => {
  if (a.phase !== b.phase) return a.phase - b.phase;

  const leftPlatoonKey = a.platoonKey ?? '';
  const rightPlatoonKey = b.platoonKey ?? '';
  if (leftPlatoonKey !== rightPlatoonKey) {
    return leftPlatoonKey.localeCompare(rightPlatoonKey);
  }

  if (a.slotNumber !== b.slotNumber) return a.slotNumber - b.slotNumber;

  const leftUnitName = a.unitName ?? a.unitBaseId;
  const rightUnitName = b.unitName ?? b.unitBaseId;
  return leftUnitName.localeCompare(rightUnitName);
});

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-sm text-gray-500">Public guild matching board</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {dataset.guild.name ?? slug}
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Territory Battle: {dataset.reference.tbKey} · Coverage {matching.coveragePercent}% ·{' '}
            {matching.totalAssigned}/{matching.totalRequired} assigned
          </p>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="text-sm text-gray-400">Total coverage</div>
            <div className="mt-2 text-3xl font-semibold text-white">{matching.coveragePercent}%</div>
            <div className="mt-1 text-xs text-gray-500">
              {matching.totalAssigned} / {matching.totalRequired} slots filled
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="text-sm text-gray-400">Assignments</div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {matching.assignments.length}
            </div>
            <div className="mt-1 text-xs text-gray-500">Optimal committed placements</div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="text-sm text-gray-400">Open gaps</div>
            <div className="mt-2 text-3xl font-semibold text-white">{matching.gaps.length}</div>
            <div className="mt-1 text-xs text-gray-500">Unmatched required slots</div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Coverage by phase and category</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sortedCoverage.map((entry) => (
              <CoverageCard
                key={`${entry.phase}-${entry.category}-${entry.isBonus ? 'bonus' : 'main'}`}
                {...entry}
              />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Assignments</h2>
          {sortedAssignments.length === 0 ? (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-400">
              No assignments available.
            </div>
          ) : (
            <div className="grid gap-3">
              {sortedAssignments.map((assignment) => (
                <AssignmentCard
                  key={`${assignment.requirementId}:${assignment.memberId}`}
                  assignment={assignment}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Gaps</h2>
          {sortedGaps.length === 0 ? (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-400">
              No open gaps.
            </div>
          ) : (
            <div className="grid gap-3">
              {sortedGaps.map((gap) => (
                <GapCard key={gap.requirementId} gap={gap} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}