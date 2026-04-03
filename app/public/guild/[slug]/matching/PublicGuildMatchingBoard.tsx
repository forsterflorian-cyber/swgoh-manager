'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import {
  formatIgnoredMatchingScopeLabel,
  getIgnoredMatchingScopeKey,
  getMatchingCategoryLabel,
  isIgnoredMatchingScope,
  normalizeIgnoredMatchingScopes,
} from '@/lib/utils/matching-scopes';
import UpgradeRecommendations from './UpgradeRecommendations';
import type {
  IgnoredMatchingScope,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
  StrategicPlannerMatchingInput,
} from '@/lib/types/platoon-readiness';

type Props = {
  slug: string;
  guildName: string;
  tbKey: string;
  matchingInput: StrategicPlannerMatchingInput;
  matching: PlatoonMatchingResult;
};

type ViewMode = 'officer' | 'member' | 'upgrades';
type StatusFilter = 'all' | 'gaps_only' | 'assigned_only' | 'placeable_only' | 'unresolved_only';
type CategoryFilter = 'all' | 'DS' | 'LS' | 'MIX' | 'BONUS';
type CoverageStatusFilter = 'all' | 'full' | 'partial' | 'empty';
type MatchingPlatoonRow =
  | {
      kind: 'assigned';
      requirementId: string;
      slotNumber: number;
      unitName: string;
      playerName: string;
    }
  | {
      kind: 'open';
      requirementId: string;
      slotNumber: number;
      unitName: string;
      action: string;
    };

type MatchingPlatoonSection = {
  platoonKey: string;
  platoonNumber: number;
  zoneName: string;
  rows: MatchingPlatoonRow[];
  assignedCount: number;
  openCount: number;
  totalCount: number;
};

const GAP_ACTION_META: Record<
  PlatoonMatchingGap['recommendedAction'],
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' }
> = {
  use_unused: {
    label: 'Use unused unit',
    variant: 'success',
  },
  upgrade: {
    label: 'Upgrade existing unit',
    variant: 'warning',
  },
  acquire: {
    label: 'Acquire or unlock unit',
    variant: 'danger',
  },
  reassign: {
    label: 'Reassignment needed',
    variant: 'info',
  },
};

function normalizeCategory(
  category: string | null | undefined,
  isBonus?: boolean | null,
): CategoryFilter {
  if (isBonus) return 'BONUS';
  if (category === 'DS' || category === 'LS' || category === 'MIX') return category;
  return 'all';
}

function formatPlatoonTitle(input: {
  platoonNumber?: number | null;
  platoonKey?: string | null;
  fallbackIndex?: number;
}) {
  if (typeof input.platoonNumber === 'number' && input.platoonNumber > 0) {
    return `Platoon ${input.platoonNumber}`;
  }

  const match = input.platoonKey?.match(/(?:platoon|pl)-?(\d+)/i);
  if (match) {
    return `Platoon ${match[1]}`;
  }

  return `Platoon ${(input.fallbackIndex ?? 0) + 1}`;
}

function formatBestNextAction(gap: PlatoonMatchingGap) {
  const source = gap.possibleSources[0];

  if (gap.recommendedAction === 'use_unused' && source) {
    return `Assign ${source.playerName}`;
  }

  if (gap.recommendedAction === 'upgrade' && source) {
    const parts: string[] = [];

    if (source.missingRelicTiers > 0) parts.push(`+${source.missingRelicTiers} relic`);
    if (source.missingRarity > 0) parts.push(`+${source.missingRarity} star`);

    return `Upgrade ${source.playerName}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
  }

  if (gap.recommendedAction === 'reassign' && source) {
    return `Reassign ${source.playerName}`;
  }

  return 'Acquire or unlock unit';
}

function buildMatchingPlatoonSections(
  assignments: PlatoonMatchingResult['assignments'],
  gaps: PlatoonMatchingResult['gaps'],
): MatchingPlatoonSection[] {
  const sections = new Map<string, MatchingPlatoonSection>();

  for (const assignment of assignments) {
    const existing = sections.get(assignment.platoonKey);
    const row: MatchingPlatoonRow = {
      kind: 'assigned',
      requirementId: assignment.requirementId,
      slotNumber: assignment.slotNumber,
      unitName: assignment.unitName ?? assignment.unitBaseId,
      playerName: assignment.playerName,
    };

    if (existing) {
      existing.rows.push(row);
      existing.assignedCount += 1;
      existing.totalCount += 1;
      continue;
    }

    sections.set(assignment.platoonKey, {
      platoonKey: assignment.platoonKey,
      platoonNumber: assignment.platoonNumber,
      zoneName: assignment.zoneName,
      rows: [row],
      assignedCount: 1,
      openCount: 0,
      totalCount: 1,
    });
  }

  for (const gap of gaps) {
    const existing = sections.get(gap.platoonKey);
    const row: MatchingPlatoonRow = {
      kind: 'open',
      requirementId: gap.requirementId,
      slotNumber: gap.slotNumber,
      unitName: gap.unitName ?? gap.unitBaseId,
      action: formatBestNextAction(gap),
    };

    if (existing) {
      existing.rows.push(row);
      existing.openCount += 1;
      existing.totalCount += 1;
      continue;
    }

    sections.set(gap.platoonKey, {
      platoonKey: gap.platoonKey,
      platoonNumber: gap.platoonNumber,
      zoneName: gap.zoneName,
      rows: [row],
      assignedCount: 0,
      openCount: 1,
      totalCount: 1,
    });
  }

  return [...sections.values()]
    .map((section) => ({
      ...section,
      rows: section.rows.toSorted((left, right) => left.slotNumber - right.slotNumber),
    }))
    .toSorted((left, right) => {
      if (left.platoonNumber !== right.platoonNumber) {
        return left.platoonNumber - right.platoonNumber;
      }

      return left.platoonKey.localeCompare(right.platoonKey);
    });
}

function CoverageCard({
  ignored,
  onToggleIgnore,
  phase,
  category,
  fullPlatoons,
  totalPlatoons,
  assignedCount,
  requirementCount,
  coveragePercent,
  isBonus,
}: PlatoonMatchingResult['coverage'][number] & {
  ignored: boolean;
  onToggleIgnore: (scope: IgnoredMatchingScope) => void;
}) {
  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'progress-fill-emerald';
    if (pct >= 75) return 'progress-fill-blue';
    if (pct >= 40) return 'progress-fill-amber';
    return 'progress-fill-rose';
  };

  return (
    <div
      className={`metric-card animate-fade-in relative ${
      coveragePercent === 100 ? 'card-glow-emerald' : 
      coveragePercent >= 50 ? '' : 'card-glow-rose'
    } ${ignored ? 'opacity-70' : ''}`}
    >
      <label className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-[var(--color-border-primary)] bg-[var(--color-surface-secondary)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={ignored}
          onChange={() => onToggleIgnore({ phase, category })}
          className="h-3.5 w-3.5 rounded border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] text-[var(--color-accent-rose)] focus:ring-[var(--color-accent-rose)]"
        />
        Ignore
      </label>

      <div className="flex items-center justify-between">
        <div>
          <div className="metric-label">
            P{phase} · {getMatchingCategoryLabel(isBonus ? 'SPECIAL' : category)}
          </div>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">
            {assignedCount} / {requirementCount} assigned
          </div>
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">
            Full Platoons {fullPlatoons}/{totalPlatoons}
          </div>
          {ignored && (
            <div className="mt-2 text-xs font-medium text-[var(--color-accent-rose)]">
              Ignored for this scenario
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{coveragePercent}%</div>
        </div>
      </div>
      <div className="mt-4 progress-bar">
        <div
          className={`progress-fill ${getProgressColor(coveragePercent)}`}
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
    <div className="stat-card animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{assignment.unitName ?? assignment.unitBaseId}</span>
            <Badge variant="neutral" size="sm">
              P{assignment.phase} · {assignment.planetCategory ?? '?'}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {assignment.playerName} · {assignment.zoneName} ·{' '}
            {formatPlatoonTitle({
              platoonNumber: assignment.platoonNumber,
              platoonKey: assignment.platoonKey,
            })}{' '}
            · Slot {assignment.slotNumber}
          </p>
        </div>
      </div>
    </div>
  );
}

function GapCard({ gap }: { gap: PlatoonMatchingGap }) {
  const meta = GAP_ACTION_META[gap.recommendedAction];

  return (
    <div className="stat-card animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{gap.unitName ?? gap.unitBaseId}</span>
            <Badge variant="neutral" size="sm">
              P{gap.phase} · {gap.isBonus ? 'Bonus' : gap.planetCategory ?? '?'}
            </Badge>
            {gap.minRelic > 0 && (
              <Badge variant="neutral" size="sm">
                R{gap.minRelic}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {(gap.zoneName ?? gap.zoneKey) + ' · '}Platoon {gap.platoonNumber ?? '?'} · Slot{' '}
            {gap.slotNumber}
          </p>
        </div>

        <Badge variant={meta.variant}>{meta.label}</Badge>
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
    </div>
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
    <select value={value} onChange={(e) => onChange(e.target.value)} className="select">
      {children}
    </select>
  );
}

export default function PublicGuildMatchingBoard({
  slug,
  guildName,
  tbKey,
  matchingInput,
  matching,
}: Props) {
  const [mode, setMode] = useState<ViewMode>('officer');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('gaps_only');
  const [coverageStatusFilter, setCoverageStatusFilter] = useState<CoverageStatusFilter>('all');
  const [platoonFilter, setPlatoonFilter] = useState<string>('all');
  const [unitQuery, setUnitQuery] = useState('');
  const [ignoredScopes, setIgnoredScopes] = useState<IgnoredMatchingScope[]>([]);

  const activeMatching = useMemo(() => {
    if (ignoredScopes.length === 0) {
      return matching;
    }

    return computePlatoonMatching(matchingInput, { ignoredScopes });
  }, [ignoredScopes, matching, matchingInput]);

  const activeCoverageByKey = useMemo(
    () =>
      new Map(
        activeMatching.coverage.map((entry) => [
          getIgnoredMatchingScopeKey({ phase: entry.phase, category: entry.category }),
          entry,
        ]),
      ),
    [activeMatching.coverage],
  );

  const ignoredScopeLabels = useMemo(
    () => ignoredScopes.map((scope) => formatIgnoredMatchingScopeLabel(scope)),
    [ignoredScopes],
  );

  const uniqueMembers = useMemo(() => {
    return [...new Set(activeMatching.assignments.map((a) => a.playerName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [activeMatching.assignments]);

  function toggleIgnoredScope(scope: IgnoredMatchingScope) {
    setIgnoredScopes((previous) => {
      const next = isIgnoredMatchingScope(previous, scope)
        ? previous.filter(
            (entry) =>
              getIgnoredMatchingScopeKey(entry) !== getIgnoredMatchingScopeKey(scope),
          )
        : [...previous, scope];

      return normalizeIgnoredMatchingScopes(next);
    });
    setPlatoonFilter('all');
  }

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
  const coverageCards = useMemo(
    () =>
      sortedCoverage.map((entry) => {
        const scope = { phase: entry.phase, category: entry.category };
        const activeEntry = activeCoverageByKey.get(getIgnoredMatchingScopeKey(scope));
        const ignored = isIgnoredMatchingScope(ignoredScopes, scope);
        const displayEntry = activeEntry ?? entry;

        return (
          <CoverageCard
            key={`${entry.phase}-${entry.category}-${entry.isBonus ? 'bonus' : 'main'}`}
            {...displayEntry}
            category={entry.category}
            isBonus={entry.isBonus}
            ignored={ignored}
            onToggleIgnore={toggleIgnoredScope}
          />
        );
      }),
    [activeCoverageByKey, ignoredScopes, sortedCoverage],
  );

  const baseFilteredAssignments = useMemo(() => {
    return [...activeMatching.assignments]
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
        return true;
      });
  }, [activeMatching.assignments, phaseFilter, categoryFilter, memberFilter, unitQuery]);

  const baseFilteredGaps = useMemo(() => {
    return [...activeMatching.gaps]
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

        return true;
      });
  }, [activeMatching.gaps, phaseFilter, categoryFilter, memberFilter, unitQuery]);

  const availablePlatoons = useMemo(
    () => buildMatchingPlatoonSections(baseFilteredAssignments, baseFilteredGaps),
    [baseFilteredAssignments, baseFilteredGaps],
  );

  const effectivePlatoonFilter =
    platoonFilter !== 'all' && !availablePlatoons.some((platoon) => platoon.platoonKey === platoonFilter)
      ? 'all'
      : platoonFilter;

  const filteredAssignments = useMemo(
    () =>
      effectivePlatoonFilter === 'all'
        ? baseFilteredAssignments
        : baseFilteredAssignments.filter((assignment) => assignment.platoonKey === effectivePlatoonFilter),
    [baseFilteredAssignments, effectivePlatoonFilter],
  );

  const filteredGaps = useMemo(
    () =>
      effectivePlatoonFilter === 'all'
        ? baseFilteredGaps
        : baseFilteredGaps.filter((gap) => gap.platoonKey === effectivePlatoonFilter),
    [baseFilteredGaps, effectivePlatoonFilter],
  );

  const sortedAssignments = useMemo(() => {
    return [...filteredAssignments]
      .filter(() => statusFilter !== 'gaps_only')
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
  }, [filteredAssignments, statusFilter, mode]);

  const sortedGaps = useMemo(() => {
    return [...filteredGaps]
      .filter((gap) => {
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
  }, [filteredGaps, statusFilter, mode]);

  const platoonDetailSections = useMemo(
    () => buildMatchingPlatoonSections(filteredAssignments, filteredGaps),
    [filteredAssignments, filteredGaps],
  );

  const visibleAssignments =
    mode === 'officer' && statusFilter === 'gaps_only' ? [] : sortedAssignments;

  const visibleGaps =
    mode === 'member' && statusFilter === 'assigned_only' ? [] : sortedGaps;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <header className="mb-8 animate-fade-in">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-blue)]">
                <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Public guild matching board</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight">
                  Platoon Matching · {guildName}
                </h1>
                <p className="mt-2 text-[var(--color-text-secondary)]">
                  Territory Battle: {tbKey} · Coverage {activeMatching.coveragePercent}% ·{' '}
                  {activeMatching.totalAssigned}/{activeMatching.totalRequired} assigned
                  {ignoredScopes.length > 0 ? ` · ${ignoredScopes.length} scope${ignoredScopes.length === 1 ? '' : 's'} ignored` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={`/public/guild/${slug}/simulator`}>
                <button className="btn btn-secondary">
                  <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Next Full Platoon Simulator
                </button>
              </Link>
            </div>
          </div>
        </header>

        {/* Stats */}
        <section className="mb-8 grid gap-6 md:grid-cols-3 animate-fade-in">
          <div className="metric-card">
            <div className="flex items-center justify-between">
              <div className="metric-label">Total coverage</div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-blue)]">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="metric-value">{activeMatching.coveragePercent}%</div>
            <div className="metric-detail">{activeMatching.totalAssigned} / {activeMatching.totalRequired} slots filled</div>
            <div className="mt-4 progress-bar">
              <div
                className="progress-fill progress-fill-blue"
                style={{ width: `${activeMatching.coveragePercent}%` }}
              />
            </div>
          </div>

          <div className="metric-card">
            <div className="flex items-center justify-between">
              <div className="metric-label">Assignments</div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-emerald)]">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="metric-value">{activeMatching.assignments.length}</div>
            <div className="metric-detail">Optimal committed placements</div>
          </div>

          <div className="metric-card">
            <div className="flex items-center justify-between">
              <div className="metric-label">Open gaps</div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-rose)]">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="metric-value">{activeMatching.gaps.length}</div>
            <div className="metric-detail">Unmatched required slots</div>
          </div>
        </section>

        {/* View Modes & Filters */}
        <section className="mb-8 card animate-fade-in">
          {/* View Mode Tabs */}
          <div className="mb-6 flex flex-wrap gap-3">
            {[
              { key: 'officer', label: 'Officer view', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
              { key: 'member', label: 'Member view', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
              { key: 'upgrades', label: '🎯 Upgrade-Empfehlungen', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            ].map((view) => (
              <button
                key={view.key}
                onClick={() => setMode(view.key as ViewMode)}
                className={`btn ${
                  mode === view.key
                    ? 'btn-primary'
                    : 'btn-ghost'
                }`}
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={view.icon} />
                </svg>
                {view.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
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

            <FilterSelect value={effectivePlatoonFilter} onChange={setPlatoonFilter}>
              <option value="all">All platoons</option>
              {availablePlatoons.map((platoon, index) => (
                <option key={platoon.platoonKey} value={platoon.platoonKey}>
                  {formatPlatoonTitle({
                    platoonNumber: platoon.platoonNumber,
                    platoonKey: platoon.platoonKey,
                    fallbackIndex: index,
                  })}
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
              className="input"
            />
          </div>
        </section>

        {/* Content based on mode */}
        {mode === 'upgrades' ? (
          <UpgradeRecommendations slug={slug} />
        ) : (
          <>
            {ignoredScopes.length > 0 && (
              <section className="mb-6 animate-fade-in">
                <div className="card">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="metric-label">Scenario ignore</div>
                      <div className="mt-2 text-sm text-[var(--color-text-muted)]">
                        Checked cards are removed from the solve so the remaining scopes can refill.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIgnoredScopes([])}
                      className="btn btn-secondary"
                    >
                      Clear ignored scopes
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ignoredScopes.map((scope, index) => (
                      <button
                        key={getIgnoredMatchingScopeKey(scope)}
                        type="button"
                        onClick={() => toggleIgnoredScope(scope)}
                        className="rounded-full border border-[var(--color-accent-rose)]/40 bg-[var(--color-accent-rose)]/10 px-3 py-1 text-xs font-medium text-[var(--color-accent-rose)]"
                      >
                        {ignoredScopeLabels[index]} ×
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Coverage Section */}
            <section className="mb-10 animate-fade-in">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Coverage by phase and category</h2>
                <Badge variant="neutral">{sortedCoverage.length} visible</Badge>
              </div>

              {sortedCoverage.length === 0 ? (
                <div className="card text-center text-[var(--color-text-muted)]">
                  No coverage entries match the current filters.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {coverageCards}
                </div>
              )}
            </section>

            <section className="mb-10 animate-fade-in">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Platoon detail</h2>
                <Badge variant="neutral">{platoonDetailSections.length} visible</Badge>
              </div>

              {platoonDetailSections.length === 0 ? (
                <div className="card text-center text-[var(--color-text-muted)]">
                  No platoons match the current filters.
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {platoonDetailSections.map((platoon, index) => (
                    <div key={platoon.platoonKey} className="stat-card animate-fade-in">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                              {formatPlatoonTitle({
                                platoonNumber: platoon.platoonNumber,
                                platoonKey: platoon.platoonKey,
                                fallbackIndex: index,
                              })}
                            </span>
                            <Badge variant={platoon.openCount > 0 ? 'warning' : 'success'} size="sm">
                              {platoon.openCount > 0
                                ? `${platoon.assignedCount}/${platoon.totalCount} filled`
                                : 'Complete'}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                            {platoon.zoneName} · {platoon.platoonKey}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {platoon.rows.map((row) =>
                          row.kind === 'assigned' ? (
                            <div
                              key={row.requirementId}
                              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4 py-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="text-sm">
                                  {row.slotNumber}. {row.unitName}
                                </div>
                                <div className="text-sm text-[var(--color-text-muted)]">
                                  {row.playerName}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div
                              key={row.requirementId}
                              className="rounded-2xl border border-amber-800/60 bg-amber-950/20 px-4 py-3"
                            >
                              <div className="text-sm">
                                {row.slotNumber}. {row.unitName}
                                {' -> OPEN'}
                              </div>
                              <div className="mt-1 text-xs text-amber-200">
                                Best next action: {row.action}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Assignments Section */}
            <section className="mb-10 animate-fade-in">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">
                  {mode === 'member' ? 'Assignments for selected member' : 'Assignments'}
                </h2>
                <Badge variant="neutral">{visibleAssignments.length} visible</Badge>
              </div>

              {visibleAssignments.length === 0 ? (
                <div className="card text-center text-[var(--color-text-muted)]">
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

            {/* Gaps Section */}
            <section className="animate-fade-in">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">
                  {mode === 'member' ? 'Possible placements / open gaps' : 'Gaps'}
                </h2>
                <Badge variant="neutral">{visibleGaps.length} visible</Badge>
              </div>

              {visibleGaps.length === 0 ? (
                <div className="card text-center text-[var(--color-text-muted)]">
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
          </>
        )}
      </div>
    </main>
  );
}
