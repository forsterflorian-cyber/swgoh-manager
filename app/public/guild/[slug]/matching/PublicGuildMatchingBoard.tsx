'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { PlatoonMatchingGap, PlatoonMatchingResult } from '@/lib/types/platoon-readiness';

type Props = {
  slug: string;
  guildName: string;
  tbKey: string;
  matching: PlatoonMatchingResult;
};

type ViewMode = 'officer' | 'member';
type StatusFilter = 'all' | 'gaps_only' | 'assigned_only' | 'placeable_only' | 'unresolved_only';
type CategoryFilter = 'all' | 'DS' | 'LS' | 'MIX' | 'BONUS';
type CoverageStatusFilter = 'all' | 'full' | 'partial' | 'empty';

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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function normalizeCategory(
  category: string | null | undefined,
  isBonus?: boolean | null,
): CategoryFilter {
  if (isBonus) return 'BONUS';
  if (category === 'DS' || category === 'LS' || category === 'MIX') return category;
  return 'all';
}


function CoverageCard({
  phase,
  category,
  assignedCount,
  requirementCount,
  coveragePercent,
  isBonus,
}: PlatoonMatchingResult['coverage'][number]) {
  return (
    <Card variant={coveragePercent === 100 ? 'success' : coveragePercent >= 50 ? 'default' : 'danger'}>
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
    </Card>
  );
}

function AssignmentCard({
  assignment,
}: {
  assignment: PlatoonMatchingResult['assignments'][number];
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">
              {assignment.unitName ?? assignment.unitBaseId}
            </span>
            <Badge variant="neutral" size="sm">
              P{assignment.phase} · {assignment.planetCategory ?? '?'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {assignment.playerName} · {assignment.platoonKey} · Slot {assignment.slotNumber}
          </p>
        </div>
      </div>
    </Card>
  );
}

function GapCard({ gap }: { gap: PlatoonMatchingGap }) {
  const meta = GAP_ACTION_META[gap.recommendedAction];
  const variantMap = {
    use_unused: 'success' as const,
    upgrade: 'warning' as const,
    acquire: 'danger' as const,
    reassign: 'info' as const,
  };

  return (
    <Card variant={variantMap[gap.recommendedAction]}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">
              {gap.unitName ?? gap.unitBaseId}
            </span>
            <Badge variant="neutral" size="sm">
              P{gap.phase} · {gap.isBonus ? 'Bonus' : gap.planetCategory ?? '?'}
            </Badge>
            {gap.minRelic > 0 && (
              <Badge variant="neutral" size="sm">
                R{gap.minRelic}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {(gap.zoneName ?? gap.zoneKey) + ' · '}Platoon {gap.platoonNumber ?? '?'} · Slot{' '}
            {gap.slotNumber}
          </p>
        </div>

        <Badge variant={variantMap[gap.recommendedAction]}>
          {meta.label}
        </Badge>
      </div>

      {gap.possibleSources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {gap.possibleSources.slice(0, 6).map((source) => (
            <Badge
              key={`${gap.requirementId}:${source.memberId}:${source.kind}`}
              variant="neutral"
              size="sm"
            >
              {source.playerName}
              {source.kind === 'near_miss' &&
                ` · -${source.missingRelicTiers ?? 0} relic / -${source.missingRarity ?? 0}★`}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-gray-800 bg-gray-950/80 px-3 py-2 text-sm text-white outline-none ring-0"
    >
      {children}
    </select>
  );
}

export default function PublicGuildMatchingBoard({
  slug,
  guildName,
  tbKey,
  matching,
}: Props) {
  const [mode, setMode] = useState<ViewMode>('officer');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('gaps_only');
  const [coverageStatusFilter, setCoverageStatusFilter] = useState<CoverageStatusFilter>('all');
  const [unitQuery, setUnitQuery] = useState('');

  const uniqueMembers = useMemo(() => {
    return [...new Set(matching.assignments.map((a) => a.playerName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [matching.assignments]);

  const sortedCoverage = useMemo(() => {
    return [...matching.coverage]
      .filter((entry) => {
        if (phaseFilter !== 'all' && String(entry.phase) !== phaseFilter) return false;

        const entryCategory = normalizeCategory(entry.category, entry.isBonus);
        if (categoryFilter !== 'all' && entryCategory !== categoryFilter) return false;

        if (coverageStatusFilter === 'full' && entry.coveragePercent < 100) return false;
        if (coverageStatusFilter === 'partial' && (entry.coveragePercent === 0 || entry.coveragePercent === 100)) {
          return false;
        }
        if (coverageStatusFilter === 'empty' && entry.coveragePercent !== 0) return false;

        return true;
      })
      .sort((a, b) => {
        if (mode === 'officer') {
          if (a.coveragePercent !== b.coveragePercent) return a.coveragePercent - b.coveragePercent;
        }
        if (a.phase !== b.phase) return a.phase - b.phase;
        if ((a.isBonus ? 1 : 0) !== (b.isBonus ? 1 : 0)) return Number(a.isBonus) - Number(b.isBonus);
        return String(a.category).localeCompare(String(b.category));
      });
  }, [matching.coverage, phaseFilter, categoryFilter, coverageStatusFilter, mode]);

  const sortedAssignments = useMemo(() => {
    return [...matching.assignments]
      .filter((assignment) => {
        if (phaseFilter !== 'all' && String(assignment.phase) !== phaseFilter) return false;

        const assignmentCategory = normalizeCategory(assignment.planetCategory, false);
        if (categoryFilter !== 'all' && assignmentCategory !== categoryFilter) return false;

        if (memberFilter !== 'all' && assignment.playerName !== memberFilter) return false;

        if (unitQuery.trim()) {
          const q = unitQuery.trim().toLowerCase();
          const haystack = `${assignment.unitName ?? ''} ${assignment.unitBaseId ?? ''}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        if (statusFilter === 'gaps_only') return false;
        return true;
      })
      .sort((a, b) => {
        if (mode === 'member') {
          const memberCompare = String(a.playerName ?? '').localeCompare(String(b.playerName ?? ''));
          if (memberCompare !== 0) return memberCompare;
        }

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
  }, [matching.assignments, phaseFilter, categoryFilter, memberFilter, unitQuery, statusFilter, mode]);

  const sortedGaps = useMemo(() => {
    return [...matching.gaps]
      .filter((gap) => {
        if (phaseFilter !== 'all' && String(gap.phase) !== phaseFilter) return false;

        const gapCategory = normalizeCategory(gap.planetCategory, gap.isBonus);
        if (categoryFilter !== 'all' && gapCategory !== categoryFilter) return false;

        if (memberFilter !== 'all') {
          const hasMatchingSource = gap.possibleSources.some((source) => source.playerName === memberFilter);
          if (!hasMatchingSource) return false;
        }

        if (unitQuery.trim()) {
          const q = unitQuery.trim().toLowerCase();
          const haystack = `${gap.unitName ?? ''} ${gap.unitBaseId ?? ''}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        if (statusFilter === 'assigned_only') return false;
        if (statusFilter === 'placeable_only' && gap.possibleSources.length === 0) return false;
        if (statusFilter === 'unresolved_only' && gap.possibleSources.length > 0) return false;

        return true;
      })
      .sort((a, b) => {
        if (mode === 'officer') {
          if (a.possibleSources.length !== b.possibleSources.length) {
            return a.possibleSources.length - b.possibleSources.length;
          }
        }

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
  }, [matching.gaps, phaseFilter, categoryFilter, memberFilter, unitQuery, statusFilter, mode]);

  const visibleAssignments =
    mode === 'officer' && statusFilter === 'gaps_only' ? [] : sortedAssignments;

  const visibleGaps =
    mode === 'member' && statusFilter === 'assigned_only' ? [] : sortedGaps;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-sm text-gray-500">Public guild matching board</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{guildName}</h1>
          <p className="mt-2 text-sm text-gray-400">
            Territory Battle: {tbKey} · Coverage {matching.coveragePercent}% ·{' '}
            {matching.totalAssigned}/{matching.totalRequired} assigned
          </p>
          <Link
            href={`/public/guild/${slug}/simulator`}
            className="mt-3 inline-block"
          >
            <Button variant="secondary">Next Full Platoon Simulator →</Button>
          </Link>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
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

        <section className="mb-8 rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('officer');
                setStatusFilter('gaps_only');
                setMemberFilter('all');
              }}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm',
                mode === 'officer'
                  ? 'border-indigo-700 bg-indigo-950/60 text-indigo-200'
                  : 'border-gray-800 bg-gray-900 text-gray-300',
              )}
            >
              Officer view
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('member');
                setStatusFilter('assigned_only');
              }}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm',
                mode === 'member'
                  ? 'border-indigo-700 bg-indigo-950/60 text-indigo-200'
                  : 'border-gray-800 bg-gray-900 text-gray-300',
              )}
            >
              Member view
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <FilterSelect value={phaseFilter} onChange={setPhaseFilter}>
              <option value="all">All phases</option>
              <option value="1">P1</option>
              <option value="2">P2</option>
              <option value="3">P3</option>
              <option value="4">P4</option>
              <option value="5">P5</option>
              <option value="6">P6</option>
            </FilterSelect>

            <FilterSelect
              value={categoryFilter}
              onChange={(value) => setCategoryFilter(value as CategoryFilter)}
            >
              <option value="all">All categories</option>
              <option value="DS">DS</option>
              <option value="LS">LS</option>
              <option value="MIX">MIX</option>
              <option value="BONUS">Bonus</option>
            </FilterSelect>

            <FilterSelect value={memberFilter} onChange={setMemberFilter}>
              <option value="all">All members</option>
              {uniqueMembers.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <option value="all">All status</option>
              <option value="gaps_only">Gaps only</option>
              <option value="assigned_only">Assigned only</option>
              <option value="placeable_only">Placeable gaps only</option>
              <option value="unresolved_only">Unresolved gaps only</option>
            </FilterSelect>

            <FilterSelect
              value={coverageStatusFilter}
              onChange={(value) => setCoverageStatusFilter(value as CoverageStatusFilter)}
            >
              <option value="all">All coverage</option>
              <option value="full">100%</option>
              <option value="partial">Partial</option>
              <option value="empty">Empty</option>
            </FilterSelect>

            <input
              value={unitQuery}
              onChange={(e) => setUnitQuery(e.target.value)}
              placeholder="Search unit"
              className="rounded-xl border border-gray-800 bg-gray-950/80 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
            />
          </div>
        </section>

        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Coverage by phase and category</h2>
            <span className="text-xs text-gray-500">{sortedCoverage.length} visible</span>
          </div>

          {sortedCoverage.length === 0 ? (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-400">
              No coverage entries match the current filters.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {sortedCoverage.map((entry) => (
                <CoverageCard
                  key={`${entry.phase}-${entry.category}-${entry.isBonus ? 'bonus' : 'main'}`}
                  {...entry}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {mode === 'member' ? 'Assignments for selected member' : 'Assignments'}
            </h2>
            <span className="text-xs text-gray-500">{visibleAssignments.length} visible</span>
          </div>

          {visibleAssignments.length === 0 ? (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-400">
              No assignments match the current filters.
            </div>
          ) : (
            <div className="grid gap-3">
              {visibleAssignments.map((assignment) => (
                <AssignmentCard
                  key={`${assignment.requirementId}:${assignment.memberId}`}
                  assignment={assignment}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {mode === 'member' ? 'Possible placements / open gaps' : 'Gaps'}
            </h2>
            <span className="text-xs text-gray-500">{visibleGaps.length} visible</span>
          </div>

          {visibleGaps.length === 0 ? (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-400">
              No gaps match the current filters.
            </div>
          ) : (
            <div className="grid gap-3">
              {visibleGaps.map((gap) => (
                <GapCard key={gap.requirementId} gap={gap} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}