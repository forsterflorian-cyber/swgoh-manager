'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Navbar } from '@/components/layout/Navbar';
import { WorkingOverlay } from '@/components/ui/WorkingOverlay';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import { formatDateTime } from '@/lib/utils/format-date';
import {
  formatIgnoredMatchingScopeLabel,
  getIgnoredMatchingScopeKey,
  getMatchingCategoryLabel,
  isIgnoredMatchingScope,
  normalizeIgnoredMatchingScopes,
} from '@/lib/utils/matching-scopes';
import { useWorkingOverlay } from '@/lib/utils/use-working-overlay';
import type { ApiEnvelope } from '@/lib/types/api';
import type {
  GapActionType,
  IgnoredMatchingScope,
  PlanetCategory,
  PlatoonMatchingCoverage,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
  StrategicMemberAssignmentLoad,
  StrategicPlannerData,
  StrategicPlannerMatchingInput,
  StrategicPlatoonStatus,
  StrategicPlannerSummary,
  StrategicRequirementSummary,
  StrategicTargetAssignment,
  StrategicTargetCandidate,
  StrategicUnitImpact,
  StrategicZoneReadiness,
} from '@/lib/types/platoon-readiness';

type Notice = {
  tone: 'success' | 'error';
  message: string;
};
type SelectedCoverageCell = {
  phase: number;
  category: PlanetCategory;
} | null;

type PlannerPlatoonCardData = {
  phase: number;
  zoneKey: string;
  zoneName: string;
  platoonKey: string;
  platoonNumber: number;
  totalSlots: number;
  filledSlots: number;
  missingSlots: number;
  status: 'ready' | 'partial' | 'blocked';
  slots: Array<{
    slotKey: string;
    slotNumber: number;
    unitName: string;
    status: StrategicRequirementSummary['status'];
  }>;
};

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

type PlannerViewKey = 'overview' | 'priorities' | 'targets' | 'matching';

const MAX_STATIONS_PER_MEMBER_PER_PLANET = 10;

const PLANNER_VIEW_ITEMS: Array<{
  key: PlannerViewKey;
  label: string;
  description: string;
}> = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'Guild health, top blockers, and immediate next actions.',
  },
  {
    key: 'priorities',
    label: 'Missing Units',
    description: 'Ranked bottlenecks with zone pressure and upgrade leverage.',
  },
  {
    key: 'targets',
    label: 'Member Targets',
    description: 'Assignments, candidate workflow, and ownership planning.',
  },
  {
    key: 'matching',
    label: 'Matching',
    description: 'Optimal slot assignments by phase and category, with gap closure paths.',
  },
];

function isPlannerViewKey(value: string | null): value is PlannerViewKey {
  return (
    value === 'overview' ||
    value === 'priorities' ||
    value === 'targets' ||
    value === 'matching'
  );
}

function buildPlannerViewHref(view: PlannerViewKey, fixture: string | null) {
  const params = new URLSearchParams();

  if (fixture === 'demo') {
    params.set('fixture', 'demo');
  }

  if (view !== 'overview') {
    params.set('view', view);
  }

  const query = params.toString();
  return query ? `/planning/platoons?${query}` : '/planning/platoons';
}

export default function PlatoonReadinessPage() {
  return (
    <Suspense fallback={<PlannerLoadingShell />}>
      <PlatoonReadinessContent />
    </Suspense>
  );
}

function PlatoonReadinessContent() {

  const [selectedCoverageCell, setSelectedCoverageCell] = useState<{ phase: number; category: PlanetCategory } | null>(null);
  const searchParams = useSearchParams();
  const fixture = searchParams.get('fixture');
  const requestedView = searchParams.get('view');
  const plannerView = isPlannerViewKey(requestedView) ? requestedView : 'overview';
  const [data, setData] = useState<StrategicPlannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const navbar = <Navbar />;

  const loadPlanner = useCallback(
    async (showLoadingState = true) => {
      if (showLoadingState) {
        setLoading(true);
      } else {
        setReloading(true);
      }

      try {
        const url =
          fixture === 'demo' ? '/api/planning/platoons?fixture=demo' : '/api/planning/platoons';
        const response = await fetch(url);
        const payload = (await response.json()) as ApiEnvelope<StrategicPlannerData>;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.ok ? 'Planner could not be loaded.' : payload.error);
        }

        setData(payload.data);
        setError(null);
      } catch (loadError: unknown) {
        if (showLoadingState) {
          setData(null);
        }

        setError(loadError instanceof Error ? loadError.message : 'Planner could not be loaded.');
      } finally {
        if (showLoadingState) {
          setLoading(false);
        } else {
          setReloading(false);
        }
      }
    },
    [fixture]
  );

  useEffect(() => {
    setNotice(null);
    void loadPlanner(true);
  }, [fixture, loadPlanner]);

  if (loading) {
    return <PlannerLoadingShell />;
  }

  if (error && !data) {
    const unauthorized = error.toLowerCase().includes('unauthorized');

    return (
      <div className="min-h-screen bg-gray-950 text-white">
        {navbar}
        <div className="mx-auto max-w-4xl px-4 py-16">
          <div className="rounded-3xl border border-red-900 bg-red-950/30 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">
              Strategic Planner
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Platoon readiness could not be loaded
            </h1>
            <p className="mt-3 text-base text-red-100/90">{error}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {unauthorized && (
                <Link
                  href="/login"
                  className="rounded-xl border border-blue-500 bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  Log in
                </Link>
              )}
              <Link
                href="/planning/platoons?fixture=demo"
                className="rounded-xl border border-gray-700 bg-gray-900 px-5 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
              >
                Open demo overview
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const planner = data;
  const summary = planner?.summary ?? null;
  const groupedZones = groupZonesByPhase(planner?.zones ?? []);
  const fixtureMode = planner?.dataState.isFixture ?? false;
  const topBlocker = planner?.topMissingUnits[0] ?? null;
  const canManageTargets = planner?.permissions.canManageTargets ?? false;
  const rosterCoveragePercent = Math.round((planner?.dataState.rosterCoverageRatio ?? 0) * 100);
  const priorityUnits = planner?.topMissingUnits ?? [];
  const strategicTargets = planner?.strategicTargets ?? [];
  const recommendedActions = planner?.recommendedActions ?? [];
  const memberCapacityPressure = planner?.memberCapacityPressure ?? null;
  const overviewMissingUnits = priorityUnits.slice(0, 4);
  const overviewBlockedZones = [...(planner?.zones ?? [])]
    .filter((zone) => zone.status !== 'ready')
    .sort((left, right) => {
      if (left.missingSlots !== right.missingSlots) {
        return right.missingSlots - left.missingSlots;
      }

      if (left.blockedPlatoons !== right.blockedPlatoons) {
        return right.blockedPlatoons - left.blockedPlatoons;
      }

      return left.phase - right.phase;
    })
    .slice(0, 4);
  const targetOpportunities = priorityUnits.filter((unit) => unit.bestCandidates.length > 0).slice(0, 4);
  const assignedMemberCount = new Set(strategicTargets.map((assignment) => assignment.guildMemberId))
    .size;
  const unassignedPriorityCount = priorityUnits.filter((unit) => unit.assignmentCount === 0).length;
  const overviewHref = buildPlannerViewHref('overview', fixture);
  const prioritiesHref = buildPlannerViewHref('priorities', fixture);
  const targetsHref = buildPlannerViewHref('targets', fixture);
  const publicTargetsHref = planner?.guild?.slug
    ? `/public/guild/${planner.guild.slug}/targets`
    : null;

  async function handleAssignTarget(
    guildMemberId: string,
    unitBaseId: string,
    memberName: string,
    unitName: string,
    planetCategory: PlanetCategory | null
  ) {
    if (!planner?.guild?.id || fixtureMode || !canManageTargets) {
      return;
    }

    const actionKey = `assign:${guildMemberId}:${unitBaseId}`;
    setBusyActionKey(actionKey);
    setNotice(null);

    try {
      const response = await fetch('/api/planning/platoons/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guildMemberId,
          unitBaseId,
          planetCategory,
        }),
      });
      const payload = (await response.json()) as ApiEnvelope<{
        assigned: boolean;
        assignmentId: string;
      }>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'Strategic target could not be assigned.' : payload.error);
      }

      await loadPlanner(false);
      setNotice({
        tone: 'success',
        message: `${memberName} is now assigned to ${unitName} as a strategic build target.`,
      });
    } catch (assignmentError: unknown) {
      setNotice({
        tone: 'error',
        message:
          assignmentError instanceof Error
            ? assignmentError.message
            : 'Strategic target could not be assigned.',
      });
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleRemoveTarget(assignmentId: string, memberName: string, unitName: string) {
    if (fixtureMode || !canManageTargets) {
      return;
    }

    const actionKey = `remove:${assignmentId}`;
    setBusyActionKey(actionKey);
    setNotice(null);

    try {
      const response = await fetch('/api/planning/platoons/targets', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId,
        }),
      });
      const payload = (await response.json()) as ApiEnvelope<{ removed: boolean }>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'Strategic target could not be removed.' : payload.error);
      }

      await loadPlanner(false);
      setNotice({
        tone: 'success',
        message: `${memberName} is no longer assigned to ${unitName}.`,
      });
    } catch (removeError: unknown) {
      setNotice({
        tone: 'error',
        message:
          removeError instanceof Error
            ? removeError.message
            : 'Strategic target could not be removed.',
      });
    } finally {
      setBusyActionKey(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {navbar}
      <div className="relative mx-auto max-w-7xl px-4 py-10">
        <WorkingOverlay
          active={reloading}
          title="Refreshing planner"
          description="Updating readiness data and recalculating the planner view."
        />
        <section className="rounded-3xl border border-gray-800 bg-gradient-to-br from-blue-950/50 via-gray-900 to-gray-950 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
                Guild Platoon Readiness
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {planner?.guild?.name ?? 'Strategic TB Readiness'}
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-gray-300">
                Based on current guild roster ownership and imported Territory Battle reference
                data. Work through the planner in three steps: overview, missing-unit priorities,
                and member targets.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {planner?.reference && (
                  <HeaderPill
                    label={`${planner.reference.name} reference`}
                    tone="info"
                  />
                )}
                {planner?.guild?.lastRosterSync && (
                  <HeaderPill
                    label={`Roster sync ${formatDateTime(planner.guild.lastRosterSync)}`}
                    tone="neutral"
                  />
                )}
                <HeaderPill
                  label={
                    planner?.dataState.hasRosterData
                      ? `${planner?.guild?.rosteredMembers ?? 0} rostered members`
                      : 'No roster cache found'
                  }
                  tone={planner?.dataState.hasRosterData ? 'positive' : 'warning'}
                />
                {fixtureMode && <HeaderPill label="Fixture mode active" tone="warning" />}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {!fixtureMode && (
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
                >
                  Open dashboard
                </Link>
              )}
              {fixtureMode ? (
                <Link
                  href={buildPlannerViewHref(plannerView, null)}
                  className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  Use live guild data
                </Link>
              ) : (
                <Link
                  href={buildPlannerViewHref(plannerView, 'demo')}
                  className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800"
                >
                  Open demo mode
                </Link>
              )}
            </div>
          </div>
        </section>

        {fixtureMode && (
          <Banner
            tone="warning"
            className="mt-6"
            title="Fixture mode active"
            body="This planner is rendering a seeded demo guild with full, partial, and hard-blocked platoon scenarios so the readiness flow can be exercised without live sync data."
          />
        )}

        {planner && !planner.dataState.hasGuild && (
          <Banner
            tone="warning"
            className="mt-6"
            title="No guild selected"
            body="Connect or create a guild to run live readiness analysis, or use demo mode to review the strategic planner."
          />
        )}

        {planner && planner.dataState.hasGuild && !planner.dataState.hasReferenceData && (
          <Banner
            tone="warning"
            className="mt-6"
            title="TB reference data missing"
            body="The planner needs imported Territory Battle reference slots before it can score guild-wide readiness."
          />
        )}

        {planner && planner.dataState.hasReferenceData && !planner.dataState.hasRosterData && (
          <Banner
            tone="warning"
            className="mt-6"
            title="Roster data missing"
            body="No roster cache is available for this guild yet. Reference demand is loaded, but every platoon gap is currently treated as uncovered until roster sync completes."
          />
        )}

        {notice && (
          <Banner
            tone={notice.tone}
            className="mt-6"
            title={notice.tone === 'success' ? 'Strategic targets updated' : 'Strategic targets failed'}
            body={notice.message}
          />
        )}

        <PlannerViewNavigation
          currentView={plannerView}
          fixture={fixture}
          summary={summary}
          missingUnitCount={priorityUnits.length}
          strategicTargetCount={strategicTargets.length}
        />

        {plannerView === 'overview' ? (
          <OverviewView
            summary={summary}
            topBlocker={topBlocker}
            topMissingUnits={overviewMissingUnits}
            blockedZones={overviewBlockedZones}
            recommendedActions={recommendedActions}
            memberCapacityPressure={memberCapacityPressure}
            rosterCoveragePercent={rosterCoveragePercent}
            planner={planner}
            prioritiesHref={prioritiesHref}
            targetsHref={targetsHref}
          />
        ) : plannerView === 'priorities' ? (
          <PrioritiesView
            summary={summary}
            topMissingUnits={priorityUnits}
            groupedZones={groupedZones}
            slotSummaries={planner?.slotSummaries ?? []}
            allZones={planner?.zones ?? []}
            canManageTargets={canManageTargets}
            fixtureMode={fixtureMode}
            busyActionKey={busyActionKey}
            onAssignTarget={handleAssignTarget}
            targetsHref={targetsHref}
          />
        ) : plannerView === 'matching' ? (
          <MatchingView
            matching={planner?.matching ?? null}
            matchingInput={planner?.matchingInput ?? null}
            selectedCoverageCell={selectedCoverageCell}
            onSelectCoverageCell={setSelectedCoverageCell}
          />
        ) : (
          <MemberTargetsView
            summary={summary}
            strategicTargets={strategicTargets}
            targetOpportunities={targetOpportunities}
            assignedMemberCount={assignedMemberCount}
            unassignedPriorityCount={unassignedPriorityCount}
            canManageTargets={canManageTargets}
            fixtureMode={fixtureMode}
            busyActionKey={busyActionKey}
            onAssignTarget={handleAssignTarget}
            onRemoveTarget={handleRemoveTarget}
            prioritiesHref={prioritiesHref}
            overviewHref={overviewHref}
            publicTargetsHref={publicTargetsHref}
          />
        )}
      </div>
    </div>
  );
}

function PlannerViewNavigation({
  currentView,
  fixture,
  summary,
  missingUnitCount,
  strategicTargetCount,
}: {
  currentView: PlannerViewKey;
  fixture: string | null;
  summary: StrategicPlannerSummary | null;
  missingUnitCount: number;
  strategicTargetCount: number;
}) {
  const metaLabels: Record<PlannerViewKey, string> = {
    overview: summary ? `${summary.coveragePercent}% slot coverage` : 'Guild readiness summary',
    priorities: `${missingUnitCount} ranked bottleneck${missingUnitCount === 1 ? '' : 's'}`,
    targets: `${strategicTargetCount} active target${strategicTargetCount === 1 ? '' : 's'}`,
    matching: 'Optimal assignment and gap analysis',
  };

  return (
    <section className="mt-6 rounded-3xl border border-gray-800 bg-gray-900/70 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            Planner Views
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Work the guild plan in three steps
          </h2>
        </div>
        <p className="max-w-2xl text-sm text-gray-400">
          Start with guild health, move into missing-unit pressure, then assign ownership in the
          member-target workspace.
        </p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {PLANNER_VIEW_ITEMS.map((item) => {
          const active = item.key === currentView;

          return (
            <Link
              key={item.key}
              href={buildPlannerViewHref(item.key, fixture)}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={`rounded-2xl border px-4 py-4 transition-colors ${
                active
                  ? 'border-blue-500 bg-blue-950/40'
                  : 'border-gray-800 bg-gray-950/60 hover:border-gray-700 hover:bg-gray-900'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">{item.label}</p>
                  <p className="mt-2 text-sm text-gray-400">{item.description}</p>
                </div>
                {active && (
                  <span className="rounded-full border border-blue-500 bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                {metaLabels[item.key]}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function OverviewView({
  summary,
  topBlocker,
  topMissingUnits,
  blockedZones,
  recommendedActions,
  memberCapacityPressure,
  rosterCoveragePercent,
  planner,
  prioritiesHref,
  targetsHref,
}: {
  summary: StrategicPlannerSummary | null;
  topBlocker: StrategicUnitImpact | null;
  topMissingUnits: StrategicUnitImpact[];
  blockedZones: StrategicZoneReadiness[];
  recommendedActions: string[];
  memberCapacityPressure: StrategicPlannerData['memberCapacityPressure'] | null;
  rosterCoveragePercent: number;
  planner: StrategicPlannerData | null;
  prioritiesHref: string;
  targetsHref: string;
}) {
  if (!summary) {
    return (
      <PlannerEmptyState
        title="Overview waiting for readiness data"
        body="Import a Territory Battle reference set and guild roster data to score guild health, blockers, and next actions."
      />
    );
  }

  return (
    <section className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            Overview
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Guild readiness at a glance
          </h2>
        </div>
        <p className="max-w-3xl text-sm text-gray-400">
          Keep this view short: overall coverage, the biggest blockers, and what leadership should
          review next.
        </p>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Coverable slots"
          value={`${summary.coverableSlots}/${summary.totalSlots}`}
          detail={`${summary.coveragePercent}% of all reference platoon slots`}
          tone={summary.coveragePercent >= 80 ? 'positive' : 'info'}
        />
        <MetricCard
          title="Missing slots"
          value={`${summary.missingSlots}`}
          detail="Slots still blocked by missing ownership or insufficient relic and rarity"
          tone={summary.missingSlots > 0 ? 'danger' : 'positive'}
        />
        <MetricCard
          title="Platoon coverage"
          value={`${summary.estimatedCoverablePlatoons}/${summary.totalPlatoons}`}
          detail="Greedy estimate of complete platoons with current guild inventory"
          tone={summary.blockedPlatoons > 0 ? 'warning' : 'positive'}
        />
        <MetricCard
          title="Blocked zones"
          value={`${summary.blockedZones}/${summary.totalZones}`}
          detail="Zones that still have unresolved strategic blockers"
          tone={summary.blockedZones > 0 ? 'warning' : 'positive'}
        />
        <MetricCard
          title="Top bottleneck"
          value={topBlocker ? topBlocker.unitName : 'None'}
          detail={
            topBlocker
              ? `${topBlocker.blockedSlots} blocked slots and ${topBlocker.limitingZones} primary zone bottlenecks`
              : 'No guild-wide bottleneck detected'
          }
          tone={topBlocker ? 'danger' : 'positive'}
        />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Biggest Blockers
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                The units worth leadership attention first
              </h3>
            </div>
            <Link
              href={prioritiesHref}
              className="text-sm font-medium text-blue-300 transition-colors hover:text-blue-200"
            >
              Open full priorities
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {topMissingUnits.length > 0 ? (
              topMissingUnits.map((unit, index) => (
                <CompactMissingUnitRow key={unit.unitBaseId} unit={unit} rank={index + 1} />
              ))
            ) : (
              <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-100">
                Current roster data covers every imported platoon slot.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Leadership Next Actions
            </p>
            <div className="mt-4 space-y-3">
              {(recommendedActions.length > 0
                ? recommendedActions.slice(0, 4)
                : ['Open Missing Units to review the highest-pressure platoon bottlenecks.']
              ).map((action, index) => (
                <div
                  key={`${action}-${index}`}
                  className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-200"
                >
                  {action}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Member Capacity Pressure
            </p>
            <div className="mt-4 space-y-3 text-sm text-gray-300">
              <CapacitySummaryLine
                label="Members near LS capacity"
                value={memberCapacityPressure?.nearCapacityByCategory.LS ?? 0}
              />
              <CapacitySummaryLine
                label="Members near DS capacity"
                value={memberCapacityPressure?.nearCapacityByCategory.DS ?? 0}
              />
              <CapacitySummaryLine
                label="Members near MIX capacity"
                value={memberCapacityPressure?.nearCapacityByCategory.MIX ?? 0}
              />
              <CapacitySummaryLine
                label="Members near SPECIAL capacity"
                value={memberCapacityPressure?.nearCapacityByCategory.SPECIAL ?? 0}
              />
              <CapacitySummaryLine
                label="Members at capacity"
                value={memberCapacityPressure?.atCapacityMembers ?? 0}
                tone={(memberCapacityPressure?.atCapacityMembers ?? 0) > 0 ? 'danger' : 'neutral'}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Guild Context
            </p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-white">{rosterCoveragePercent}%</h3>
                <p className="mt-2 text-sm text-gray-400">
                  Share of guild members with relevant roster data for imported platoon units.
                </p>
              </div>
              <span className="rounded-full border border-gray-800 bg-gray-950/70 px-3 py-1 text-xs text-gray-300">
                {planner?.guild?.rosteredMembers ?? 0} rostered members
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-950">
              <div className="h-full bg-blue-400" style={{ width: `${rosterCoveragePercent}%` }} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {planner?.reference && (
                <HeaderPill label={`${planner.reference.name} reference`} tone="info" />
              )}
              <HeaderPill
                label={
                  planner?.dataState.hasRosterData ? 'Roster data available' : 'Roster cache missing'
                }
                tone={planner?.dataState.hasRosterData ? 'positive' : 'warning'}
              />
            </div>

            <div className="mt-5 grid gap-3">
              <Link
                href={prioritiesHref}
                className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Review missing-unit priorities
              </Link>
              <Link
                href={targetsHref}
                className="rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-900"
              >
                Open member targets
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Top Blocked Zones
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Where readiness breaks first
            </h3>
          </div>
          <Link
            href={prioritiesHref}
            className="text-sm font-medium text-blue-300 transition-colors hover:text-blue-200"
          >
            Open zone pressure
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {blockedZones.length > 0 ? (
            blockedZones.map((zone) => <CompactZoneRow key={zone.zoneKey} zone={zone} />)
          ) : (
            <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-100">
              No blocked zones detected with the current guild roster.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Progression buckets
// ---------------------------------------------------------------------------

type ProgressionBucket = 'actionable_now' | 'next_up' | 'later';

const BUCKET_ORDER: Record<ProgressionBucket, number> = {
  actionable_now: 0,
  next_up: 1,
  later: 2,
};

/**
 * Heuristic bucket for a TB phase.
 * ROTE has 6 phases: P1-P2 are actively worked, P3-P4 come next, P5-P6 are future.
 */
function getZoneBucket(phase: number): ProgressionBucket {
  if (phase <= 2) return 'actionable_now';
  if (phase <= 4) return 'next_up';
  return 'later';
}

/**
 * Returns the earliest bucket in which this unit has at least one blocked slot.
 * Always scans the full slotSummaries (not the filtered scope) so the badge
 * reflects the unit's true global urgency regardless of any active filter.
 */
function getUnitEarliestBucket(
  unitBaseId: string,
  slotSummaries: StrategicRequirementSummary[]
): ProgressionBucket {
  let minPhase = Number.MAX_SAFE_INTEGER;
  for (const s of slotSummaries) {
    if (s.unitBaseId === unitBaseId && s.blocked && s.phase < minPhase) {
      minPhase = s.phase;
    }
  }
  return minPhase === Number.MAX_SAFE_INTEGER ? 'later' : getZoneBucket(minPhase);
}

/**
 * Returns the minimum zone progression score for this unit across all its blocked slots.
 * Score = phase * 10000 + zone index within phase (regular zones indexed before bonus zones).
 * Lower score means earlier in the TB flow; used as secondary sort key after the bucket.
 *
 * zoneProgressionOrder is built from groupedZones inside PrioritiesView so it uses
 * the server-side zone ordering without any additional API calls.
 */
function getUnitProgressionScore(
  unitBaseId: string,
  slotSummaries: StrategicRequirementSummary[],
  zoneProgressionOrder: Map<string, number>
): number {
  let min = Number.MAX_SAFE_INTEGER;
  for (const s of slotSummaries) {
    if (s.unitBaseId === unitBaseId && s.blocked) {
      const zoneScore = zoneProgressionOrder.get(s.zoneKey) ?? Number.MAX_SAFE_INTEGER;
      if (zoneScore < min) min = zoneScore;
    }
  }
  return min;
}

function PrioritiesView({
  summary,
  topMissingUnits,
  groupedZones,
  slotSummaries,
  allZones,
  canManageTargets,
  fixtureMode,
  busyActionKey,
  onAssignTarget,
  targetsHref,
}: {
  summary: StrategicPlannerSummary | null;
  topMissingUnits: StrategicUnitImpact[];
  groupedZones: Array<[number, StrategicZoneReadiness[]]>;
  slotSummaries: StrategicRequirementSummary[];
  allZones: StrategicZoneReadiness[];
  canManageTargets: boolean;
  fixtureMode: boolean;
  busyActionKey: string | null;
  onAssignTarget: (
    guildMemberId: string,
    unitBaseId: string,
    memberName: string,
    unitName: string,
    planetCategory: PlanetCategory | null
  ) => Promise<void>;
  targetsHref: string;
}) {
  const [selectedPhase, setSelectedPhase] = useState<number | 'all'>('all');
  const [selectedZone, setSelectedZone] = useState<string | 'all'>('all');
  const [selectedPlatoon, setSelectedPlatoon] = useState<string | 'all'>('all');

  const isFiltered =
    selectedPhase !== 'all' || selectedZone !== 'all' || selectedPlatoon !== 'all';

  // All phases from the TB reference (via groupedZones, already phase-sorted).
  // Using groupedZones rather than slotSummaries so phases with no blocked slots
  // still appear as selectable filter options.
  const availablePhases = groupedZones.map(([phase]) => phase);

  // Zones available for the current phase selection.
  const zonesForPhase: StrategicZoneReadiness[] =
    selectedPhase === 'all'
      ? []
      : allZones.filter((z) => z.phase === selectedPhase);
  const selectedZoneData =
    selectedZone === 'all' ? null : allZones.find((zone) => zone.zoneKey === selectedZone) ?? null;
  const platoonsForZone = selectedZoneData?.platoons ?? [];

  function handlePhaseSelect(phase: number | 'all') {
    setSelectedPhase(phase);
    setSelectedPlatoon('all');
    // Reset zone if it doesn't belong to the new phase selection.
    if (phase === 'all') {
      setSelectedZone('all');
    } else if (selectedZone !== 'all') {
      const stillValid = allZones.some((z) => z.phase === phase && z.zoneKey === selectedZone);
      if (!stillValid) setSelectedZone('all');
    }
  }

  function handleZoneSelect(zoneKey: string | 'all') {
    setSelectedZone(zoneKey);
    setSelectedPlatoon('all');
  }

  // Single source of truth: slot summaries that are in scope AND blocked.
  // Rule 2: missingSlots = blocked.length (raw count, not distinct).
  // Rule 3: blockedPlatoons / blockedZones = distinct keys among blocked entries.
  const blockedInScope: StrategicRequirementSummary[] = isFiltered
    ? slotSummaries.filter((s) => {
        if (selectedPhase !== 'all' && s.phase !== selectedPhase) return false;
        if (selectedZone !== 'all' && s.zoneKey !== selectedZone) return false;
        if (selectedPlatoon !== 'all' && s.platoonKey !== selectedPlatoon) return false;
        return s.blocked;
      })
    : [];

  const scopedMetrics = isFiltered
    ? {
        missingSlots: blockedInScope.length,
        blockedPlatoons: new Set(blockedInScope.map((s) => s.platoonKey)).size,
        blockedZones: new Set(blockedInScope.map((s) => s.zoneKey)).size,
        bottleneckUnitCount: new Set(blockedInScope.map((s) => s.unitBaseId)).size,
      }
    : summary
      ? {
          missingSlots: summary.missingSlots,
          blockedPlatoons: summary.blockedPlatoons,
          blockedZones: summary.blockedZones,
          bottleneckUnitCount: summary.bottleneckUnitCount,
        }
      : null;

  // Rule 1: a unit is visible only if it has at least one scoped blocked slot summary.
  const scopedBlockedUnitIds = isFiltered
    ? new Set(blockedInScope.map((s) => s.unitBaseId))
    : null;

  // Build a stable zone progression order from groupedZones (already phase-sorted by
  // the server). Within each phase, regular zones (no '-bonus-' in key) index before
  // bonus zones; position within each group approximates the DB sort_order without a
  // new API call.
  const zoneProgressionOrder = new Map<string, number>();
  for (const [phase, zones] of groupedZones) {
    const regular = zones.filter((z) => !z.zoneKey.includes('-bonus-'));
    const bonus = zones.filter((z) => z.zoneKey.includes('-bonus-'));
    [...regular, ...bonus].forEach((z, idx) => {
      zoneProgressionOrder.set(z.zoneKey, phase * 10000 + idx);
    });
  }

  // Precompute scoped demand for every unit once so the sort comparator is O(1).
  const unitDemandCache = isFiltered
    ? new Map(
        topMissingUnits.map((u) => [
          u.unitBaseId,
          computeUnitDemand(u.unitBaseId, slotSummaries, {
            phase: selectedPhase,
            zoneKey: selectedZone,
            platoonKey: selectedPlatoon,
          }),
        ])
      )
    : null;

  // Sort:
  // - Filtered view: scoped demand desc (zone or phase req), then blockedSlotsInScope desc,
  //   then blockedPlatoonsInScope desc, then globalImpact as tie-breaker.
  // - Unfiltered: bucket first (Now → Next → Later), then earliest TB-flow zone for that unit.
  const visibleUnits = (
    scopedBlockedUnitIds
      ? topMissingUnits.filter((u) => scopedBlockedUnitIds.has(u.unitBaseId))
      : topMissingUnits
  ).toSorted((a, b) => {
    if (isFiltered && unitDemandCache) {
      const da = unitDemandCache.get(a.unitBaseId)!;
      const db = unitDemandCache.get(b.unitBaseId)!;
      const primaryA =
        selectedPlatoon !== 'all'
          ? da.platoonRequired
          : selectedZone !== 'all'
            ? da.zoneRequired
            : da.phaseRequired;
      const primaryB =
        selectedPlatoon !== 'all'
          ? db.platoonRequired
          : selectedZone !== 'all'
            ? db.zoneRequired
            : db.phaseRequired;
      if (primaryB !== primaryA) return primaryB - primaryA;
      if (db.blockedSlotsInScope !== da.blockedSlotsInScope)
        return db.blockedSlotsInScope - da.blockedSlotsInScope;
      if (db.blockedPlatoonsInScope !== da.blockedPlatoonsInScope)
        return db.blockedPlatoonsInScope - da.blockedPlatoonsInScope;
      return b.impactScore - a.impactScore;
    }
    const bucketDiff =
      BUCKET_ORDER[getUnitEarliestBucket(a.unitBaseId, slotSummaries)] -
      BUCKET_ORDER[getUnitEarliestBucket(b.unitBaseId, slotSummaries)];
    if (bucketDiff !== 0) return bucketDiff;
    return (
      getUnitProgressionScore(a.unitBaseId, slotSummaries, zoneProgressionOrder) -
      getUnitProgressionScore(b.unitBaseId, slotSummaries, zoneProgressionOrder)
    );
  });

  // Filter zone pressure section; regular zones before bonus within each phase group.
  const visibleGroupedZones: Array<[number, StrategicZoneReadiness[]]> = groupedZones
    .filter(([phase]) => selectedPhase === 'all' || phase === selectedPhase)
    .map(([phase, zones]) => {
      const filtered =
        selectedZone === 'all' ? zones : zones.filter((z) => z.zoneKey === selectedZone);
      const regular = filtered.filter((z) => !z.zoneKey.includes('-bonus-'));
      const bonus = filtered.filter((z) => z.zoneKey.includes('-bonus-'));
      return [phase, [...regular, ...bonus]] as [number, StrategicZoneReadiness[]];
    })
    .filter(([, zones]) => zones.length > 0);
  const visiblePlatoonCards = buildPlannerPlatoonCards(slotSummaries, {
    phase: selectedPhase,
    zoneKey: selectedZone,
    platoonKey: selectedPlatoon,
  });

  if (!summary && topMissingUnits.length === 0 && groupedZones.length === 0) {
    return (
      <PlannerEmptyState
        title="Missing-unit priorities will appear once readiness data is available"
        body="Import a Territory Battle reference set and guild roster data to rank the units and zones that matter most."
      />
    );
  }

  return (
    <section className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            Missing Units
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Rank the bottlenecks that matter most
          </h2>
        </div>
        <Link
          href={targetsHref}
          className="text-sm font-medium text-blue-300 transition-colors hover:text-blue-200"
        >
          Move into member targets
        </Link>
      </div>

      {availablePhases.length > 0 && (
        <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Phase
              </span>
              <FilterPill
                label="All"
                active={selectedPhase === 'all'}
                onClick={() => handlePhaseSelect('all')}
              />
              {availablePhases.map((phase) => (
                <FilterPill
                  key={phase}
                  label={`P${phase}`}
                  active={selectedPhase === phase}
                  onClick={() => handlePhaseSelect(phase)}
                />
              ))}
            </div>

            {zonesForPhase.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Zone
                </span>
                <FilterPill
                  label="All"
                  active={selectedZone === 'all'}
                  onClick={() => handleZoneSelect('all')}
                  secondary
                />
                {zonesForPhase.map((zone) => (
                  <FilterPill
                    key={zone.zoneKey}
                    label={zone.zoneName}
                    active={selectedZone === zone.zoneKey}
                    onClick={() => handleZoneSelect(zone.zoneKey)}
                    secondary
                  />
                ))}
              </div>
            )}

            {platoonsForZone.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Platoon
                </span>
                <FilterPill
                  label="All"
                  active={selectedPlatoon === 'all'}
                  onClick={() => setSelectedPlatoon('all')}
                  secondary
                />
                {platoonsForZone.map((platoon: StrategicPlatoonStatus) => (
                  <FilterPill
                    key={platoon.platoonKey}
                    label={formatPlatoonTitle({
                      platoonNumber: platoon.platoonNumber,
                      platoonKey: platoon.platoonKey,
                    })}
                    active={selectedPlatoon === platoon.platoonKey}
                    onClick={() => setSelectedPlatoon(platoon.platoonKey)}
                    secondary
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {scopedMetrics && (
        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Bottleneck units"
            value={`${scopedMetrics.bottleneckUnitCount}`}
            detail={isFiltered ? 'Distinct bottleneck units in selected scope' : 'Distinct units currently constraining platoon readiness'}
            tone={scopedMetrics.bottleneckUnitCount > 0 ? 'warning' : 'positive'}
          />
          <MetricCard
            title="Missing slots"
            value={`${scopedMetrics.missingSlots}`}
            detail={isFiltered ? 'Blocked slots in selected scope' : 'Blocked demand still unresolved across the imported reference'}
            tone={scopedMetrics.missingSlots > 0 ? 'danger' : 'positive'}
          />
          <MetricCard
            title="Blocked platoons"
            value={`${scopedMetrics.blockedPlatoons}`}
            detail={isFiltered ? 'Platoons with blocked slots in selected scope' : 'Platoons still short of required guild inventory'}
            tone={scopedMetrics.blockedPlatoons > 0 ? 'warning' : 'positive'}
          />
          <MetricCard
            title="Blocked zones"
            value={`${scopedMetrics.blockedZones}`}
            detail={isFiltered ? 'Zones with blocked slots in selected scope' : 'Zones under structural pressure from missing units'}
            tone={scopedMetrics.blockedZones > 0 ? 'warning' : 'positive'}
          />
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Ranked Missing Units
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {isFiltered ? 'Bottlenecks in selected scope' : 'Full bottleneck ranking'}
            </h3>
          </div>
          <p className="max-w-2xl text-sm text-gray-400">
            Impact blends blocked demand, limiting zones and platoons, shortage depth, and upgrade
            leverage. Candidate suggestions stay secondary to the unit analysis.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {visibleUnits.length > 0 ? (
            visibleUnits.map((unit, index) => (
              <MissingUnitCard
                key={unit.unitBaseId}
                unit={unit}
                rank={index + 1}
                bucket={getUnitEarliestBucket(unit.unitBaseId, slotSummaries)}
                slotSummaries={slotSummaries}
                selectedPhase={selectedPhase}
                selectedZone={selectedZone}
                selectedPlatoon={selectedPlatoon}
                candidateLimit={3}
                canManageTargets={canManageTargets}
                fixtureMode={fixtureMode}
                busyActionKey={busyActionKey}
                onAssignTarget={onAssignTarget}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-5 text-sm text-emerald-100">
              {isFiltered
                ? 'No blocked units in the selected scope.'
                : 'Current roster data covers every imported platoon slot.'}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Platoon Detail
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Compact fill view by platoon
            </h3>
          </div>
          <p className="text-sm text-gray-400">
            Every slot stays visible so coverage and missing units are easy to scan.
          </p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {visiblePlatoonCards.length > 0 ? (
            visiblePlatoonCards.map((platoon, index) => (
              <PlannerPlatoonStatusCard
                key={platoon.platoonKey}
                platoon={platoon}
                fallbackIndex={index}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5 text-sm text-gray-400">
              No platoon detail is available for the current scope.
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Zone Pressure
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Zone and platoon context
            </h3>
          </div>
          <p className="text-sm text-gray-400">
            Every zone is evaluated from guild roster plus imported platoon requirements only.
          </p>
        </div>

        <div className="mt-5 space-y-8">
          {visibleGroupedZones.length > 0 ? (
            visibleGroupedZones.map(([phase, zones]) => (
              <div key={phase}>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h4 className="text-xl font-semibold text-white">Phase {phase}</h4>
                    <ProgressionBucketBadge bucket={getZoneBucket(phase)} />
                  </div>
                  <span className="text-sm text-gray-500">
                    {zones.length} zone{zones.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {zones.map((zone) => (
                    <ZoneReadinessCard key={zone.zoneKey} zone={zone} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5 text-sm text-gray-400">
              {isFiltered
                ? 'No zone pressure data for the selected scope.'
                : 'Zone pressure will appear here once the planner has enough readiness data.'}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

const BUCKET_BADGE: Record<ProgressionBucket, { label: string; className: string }> = {
  actionable_now: {
    label: 'Now',
    className: 'border-emerald-800 bg-emerald-950/60 text-emerald-200',
  },
  next_up: {
    label: 'Next',
    className: 'border-amber-800 bg-amber-950/60 text-amber-200',
  },
  later: {
    label: 'Later',
    className: 'border-gray-700 bg-gray-900 text-gray-400',
  },
};

function ProgressionBucketBadge({ bucket }: { bucket: ProgressionBucket }) {
  const { label, className } = BUCKET_BADGE[bucket];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  secondary = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
        active
          ? secondary
            ? 'border-indigo-500 bg-indigo-900/60 text-indigo-200'
            : 'border-blue-500 bg-blue-900/60 text-blue-200'
          : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

function PlannerPlatoonStatusCard({
  platoon,
  fallbackIndex,
}: {
  platoon: PlannerPlatoonCardData;
  fallbackIndex: number;
}) {
  const statusTone =
    platoon.status === 'ready'
      ? 'border-emerald-900 bg-emerald-950/20'
      : platoon.status === 'partial'
        ? 'border-amber-900 bg-amber-950/20'
        : 'border-red-900 bg-red-950/20';
  const badgeTone =
    platoon.status === 'ready'
      ? 'border-emerald-900 bg-emerald-950/40 text-emerald-200'
      : platoon.status === 'partial'
        ? 'border-amber-900 bg-amber-950/40 text-amber-200'
        : 'border-red-900 bg-red-950/40 text-red-200';

  return (
    <div className={`rounded-2xl border p-5 ${statusTone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            Phase {platoon.phase} · {platoon.zoneName}
          </p>
          <h4 className="mt-2 text-xl font-semibold text-white">
            {formatPlatoonTitle({
              platoonNumber: platoon.platoonNumber,
              platoonKey: platoon.platoonKey,
              fallbackIndex,
            })}
          </h4>
          <p className="mt-1 text-sm text-gray-400">{platoon.platoonKey}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className={`rounded-full border px-3 py-1 ${badgeTone}`}>
            {platoon.filledSlots}/{platoon.totalSlots} filled
          </span>
          <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
            {platoon.missingSlots} missing
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {platoon.slots.map((slot) => {
          const slotStatus = formatPlannerSlotStatus(slot.status);

          return (
            <div
              key={slot.slotKey}
              className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-white">
                  {slot.slotNumber}. {slot.unitName}
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${slotStatus.className}`}>
                  {slotStatus.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Matching view ─────────────────────────────────────────────────────────────

const EMPTY_MATCHING_RESULT: PlatoonMatchingResult = {
  coverage: [],
  assignments: [],
  gaps: [],
  totalAssigned: 0,
  totalRequired: 0,
  coveragePercent: 100,
};

const GAP_ACTION_META: Record<GapActionType, { label: string; className: string; detail: string }> =
  {
    use_unused: {
      label: 'Available',
      className: 'border-emerald-900 bg-emerald-950/30 text-emerald-200',
      detail: 'An eligible owner exists with remaining capacity.',
    },
    reassign: {
      label: 'Reassign',
      className: 'border-amber-900 bg-amber-950/30 text-amber-200',
      detail: 'All eligible owners are committed elsewhere. Rebalancing could free one up.',
    },
    upgrade: {
      label: 'Upgrade',
      className: 'border-blue-900 bg-blue-950/30 text-blue-200',
      detail: 'Near-miss owners exist — small relic or rarity gains close this gap.',
    },
    acquire: {
      label: 'Acquire',
      className: 'border-red-900 bg-red-950/30 text-red-200',
      detail: 'No guild member owns or is close to owning this unit at the required level.',
    },
  };

function CoverageGrid({
  coverage,
  referenceCoverage,
  selectedCell,
  ignoredScopes,
  onSelect,
  onToggleIgnore,
}: {
  coverage: PlatoonMatchingCoverage[];
  referenceCoverage?: PlatoonMatchingCoverage[];
  selectedCell?: SelectedCoverageCell;
  ignoredScopes?: IgnoredMatchingScope[];
  onSelect?: (phase: number, category: PlanetCategory) => void;
  onToggleIgnore?: (scope: IgnoredMatchingScope) => void;
}) {
  const coverageSource = referenceCoverage ?? coverage;
  const phases = [...new Set(coverageSource.map((c) => c.phase))].sort((a, b) => a - b);
  const categories: PlanetCategory[] = ['LS', 'DS', 'MIX', 'SPECIAL'];

  function cellFor(phase: number, category: PlanetCategory) {
    return coverage.find((c) => c.phase === phase && c.category === category);
  }

  function referenceCellFor(phase: number, category: PlanetCategory) {
    return coverageSource.find((c) => c.phase === phase && c.category === category);
  }

  function cellClass(pct: number) {
    if (pct >= 100) return 'bg-emerald-950/60 text-emerald-200 border-emerald-900';
    if (pct >= 75) return 'bg-blue-950/60 text-blue-200 border-blue-900';
    if (pct >= 40) return 'bg-amber-950/60 text-amber-200 border-amber-900';
    return 'bg-red-950/60 text-red-200 border-red-900';
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Phase
            </th>
            {categories.map((cat) => (
              <th
                key={cat}
                className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-gray-500"
              >
                {getMatchingCategoryLabel(cat)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {phases.map((phase) => (
            <tr key={phase}>
              <td className="py-3 pr-4 font-semibold text-white">P{phase}</td>
              {categories.map((cat) => {
                const scope = { phase, category: cat };
                const cell = cellFor(phase, cat);
                const referenceCell = referenceCellFor(phase, cat);
                const ignored = isIgnoredMatchingScope(ignoredScopes ?? [], scope);
                const selected =
                  selectedCell?.phase === phase && selectedCell.category === cat;

                if (!cell && !referenceCell) {
                  return (
                    <td key={cat} className="px-3 py-2 text-center text-gray-700">
                      —
                    </td>
                  );
                }

                const displayCell = cell ?? referenceCell;
                if (!displayCell) {
                  return (
                    <td key={cat} className="px-3 py-2 text-center text-gray-700">
                      —
                    </td>
                  );
                }

                return (
                  <td key={cat} className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!ignored) {
                            onSelect?.(phase, cat);
                          }
                        }}
                        disabled={ignored}
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                          ignored
                            ? 'cursor-not-allowed border-gray-800 bg-gray-900 text-gray-500'
                            : `${cellClass(displayCell.coveragePercent)} ${selected ? 'ring-2 ring-white/40' : ''}`
                        }`}
                      >
                        {ignored
                          ? 'Ignored'
                          : `${displayCell.assignedCount}/${displayCell.requirementCount}`}
                      </button>

                      {ignored && referenceCell ? (
                        <span className="text-[11px] text-gray-500">
                          was {referenceCell.assignedCount}/{referenceCell.requirementCount}
                        </span>
                      ) : null}

                      {onToggleIgnore ? (
                        <button
                          type="button"
                          onClick={() => onToggleIgnore(scope)}
                          className={`text-[11px] font-medium ${
                            ignored
                              ? 'text-red-300 hover:text-red-200'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {ignored ? 'Restore' : 'Ignore'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
  {gap.zoneName} · Platoon {gap.platoonNumber} · Slot {gap.slotNumber}
</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
          {meta.label}
        </span>
      </div>

      {gap.possibleSources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {gap.possibleSources.slice(0, 5).map((src) => (
            <span
              key={src.memberId}
              className="rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-xs text-gray-300"
              title={
                src.kind === 'near_miss'
                  ? `R+${src.missingRelicTiers} ★+${src.missingRarity} needed`
                  : 'Eligible now'
              }
            >
              {src.playerName}
              {src.kind === 'near_miss' &&
                ` (R+${src.missingRelicTiers}${src.missingRarity > 0 ? ` ★+${src.missingRarity}` : ''})`}
            </span>
          ))}
          {gap.possibleSources.length > 5 && (
            <span className="rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-xs text-gray-500">
              +{gap.possibleSources.length - 5} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function buildMatchingPlatoonSections(
  assignments: PlatoonMatchingResult['assignments'],
  gaps: PlatoonMatchingGap[]
): MatchingPlatoonSection[] {
  const sections = new Map<string, MatchingPlatoonSection>();

  for (const assignment of assignments) {
    const existing = sections.get(assignment.platoonKey);
    const row: MatchingPlatoonRow = {
      kind: 'assigned',
      requirementId: assignment.requirementId,
      slotNumber: assignment.slotNumber,
      unitName: assignment.unitName ?? assignment.unitBaseId,
      playerName: assignment.playerName ?? assignment.memberId,
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

function MatchingView({
  matching,
  matchingInput,
  selectedCoverageCell,
  onSelectCoverageCell,
}: {
  matching: PlatoonMatchingResult | null;
  matchingInput: StrategicPlannerMatchingInput | null;
  selectedCoverageCell: SelectedCoverageCell;
  onSelectCoverageCell: (cell: SelectedCoverageCell) => void;
}) {
  const [gapFilter, setGapFilter] = useState<GapActionType | 'all'>('all');
  const [selectedPlatoonKey, setSelectedPlatoonKey] = useState<string | 'all'>('all');
  const [ignoredScopes, setIgnoredScopes] = useState<IgnoredMatchingScope[]>([]);
  const { isWorking: isScenarioUpdating, runWithOverlay: runScenarioOverlay } =
    useWorkingOverlay();
  const baselineMatching = matching ?? EMPTY_MATCHING_RESULT;

  const availableScopeKeys = useMemo(
    () =>
      new Set(
        baselineMatching.coverage.map((entry) =>
          getIgnoredMatchingScopeKey({
            phase: entry.phase,
            category: entry.category,
          }),
        ),
      ),
    [baselineMatching.coverage],
  );

  const sanitizedIgnoredScopes = useMemo(
    () =>
      normalizeIgnoredMatchingScopes(
        ignoredScopes.filter((scope) =>
          availableScopeKeys.has(getIgnoredMatchingScopeKey(scope)),
        ),
      ),
    [availableScopeKeys, ignoredScopes],
  );

  const activeMatching = useMemo(() => {
    if (!matchingInput || sanitizedIgnoredScopes.length === 0) {
      return baselineMatching;
    }

    return computePlatoonMatching(matchingInput, { ignoredScopes: sanitizedIgnoredScopes });
  }, [baselineMatching, sanitizedIgnoredScopes, matchingInput]);

  const activeSelectedCoverageCell =
    selectedCoverageCell &&
    !isIgnoredMatchingScope(sanitizedIgnoredScopes, selectedCoverageCell) &&
    activeMatching.coverage.some(
      (entry) =>
        entry.phase === selectedCoverageCell.phase &&
        entry.category === selectedCoverageCell.category,
    )
      ? selectedCoverageCell
      : null;

  const selectedCoverage = activeSelectedCoverageCell
    ? activeMatching.coverage.find(
        (c) =>
          c.phase === activeSelectedCoverageCell.phase &&
          c.category === activeSelectedCoverageCell.category
      ) ?? null
    : null;

  const selectedAssignments = activeSelectedCoverageCell
    ? activeMatching.assignments.filter(
        (a) =>
          a.phase === activeSelectedCoverageCell.phase &&
          a.planetCategory === activeSelectedCoverageCell.category
      )
    : [];

  const selectedGaps = activeSelectedCoverageCell
    ? activeMatching.gaps.filter(
        (gap) =>
          gap.phase === activeSelectedCoverageCell.phase &&
          gap.planetCategory === activeSelectedCoverageCell.category
      )
    : [];
  const availableSelectedPlatoons = buildMatchingPlatoonSections(selectedAssignments, selectedGaps);
  const effectiveSelectedPlatoonKey =
    selectedPlatoonKey !== 'all' &&
    !availableSelectedPlatoons.some((platoon) => platoon.platoonKey === selectedPlatoonKey)
      ? 'all'
      : selectedPlatoonKey;
  const filteredSelectedAssignments =
    effectiveSelectedPlatoonKey === 'all'
      ? selectedAssignments
      : selectedAssignments.filter(
          (assignment) => assignment.platoonKey === effectiveSelectedPlatoonKey
        );
  const filteredSelectedGaps =
    effectiveSelectedPlatoonKey === 'all'
      ? selectedGaps
      : selectedGaps.filter((gap) => gap.platoonKey === effectiveSelectedPlatoonKey);
  const visibleSelectedPlatoons = buildMatchingPlatoonSections(
    filteredSelectedAssignments,
    filteredSelectedGaps
  );
  const selectedScopeRequiredCount = visibleSelectedPlatoons.reduce(
    (count, platoon) => count + platoon.totalCount,
    0
  );
  const selectedScopeAssignedCount = visibleSelectedPlatoons.reduce(
    (count, platoon) => count + platoon.assignedCount,
    0
  );
  const selectedScopeCoveragePercent =
    selectedScopeRequiredCount > 0
      ? Math.round((selectedScopeAssignedCount / selectedScopeRequiredCount) * 100)
      : 100;
  const selectedPlatoonLabel =
    effectiveSelectedPlatoonKey === 'all'
      ? null
      : availableSelectedPlatoons.find(
          (platoon) => platoon.platoonKey === effectiveSelectedPlatoonKey
        ) ?? null;

  const selectedGapActionOrder: GapActionType[] = ['use_unused', 'reassign', 'upgrade', 'acquire'];

  const selectedGapCounts = Object.fromEntries(
    selectedGapActionOrder.map((action) => [
      action,
      filteredSelectedGaps.filter((g) => g.recommendedAction === action).length,
    ])
  ) as Record<GapActionType, number>;

  const visibleSelectedGaps =
    gapFilter === 'all'
      ? [...filteredSelectedGaps].sort(
          (a, b) =>
            selectedGapActionOrder.indexOf(a.recommendedAction) -
            selectedGapActionOrder.indexOf(b.recommendedAction)
        )
      : filteredSelectedGaps.filter((g) => g.recommendedAction === gapFilter);
  const selectedBaselineCoverage = activeSelectedCoverageCell
    ? baselineMatching.coverage.find(
        (entry) =>
          entry.phase === activeSelectedCoverageCell.phase &&
          entry.category === activeSelectedCoverageCell.category,
      ) ?? null
    : null;
  const discordExport = activeSelectedCoverageCell && selectedCoverage
    ? [
        `Ignored for this scenario: ${
          sanitizedIgnoredScopes.length > 0
            ? sanitizedIgnoredScopes
                .map((scope) => formatIgnoredMatchingScopeLabel(scope))
                .join(', ')
            : 'None'
        }`,
        '',
        `P${selectedCoverage.phase} · ${
          getMatchingCategoryLabel(selectedCoverage.category)
        } — ${selectedScopeAssignedCount}/${selectedScopeRequiredCount} assigned, ${filteredSelectedGaps.length} open`,
        '',
        ...visibleSelectedPlatoons.flatMap((platoon, index) => [
          `${formatPlatoonTitle({
            platoonNumber: platoon.platoonNumber,
            platoonKey: platoon.platoonKey,
            fallbackIndex: index,
          })} · ${platoon.zoneName}`,
          ...platoon.rows.flatMap((row) =>
            row.kind === 'assigned'
              ? [`${row.slotNumber}. ${row.unitName} -> ${row.playerName}`]
              : [
                  `${row.slotNumber}. ${row.unitName} -> OPEN`,
                  `   Best next action: ${row.action}`,
                ]
          ),
          '',
        ]),
      ].join('\n')
    : '';
  const globalGapActionOrder: GapActionType[] = ['use_unused', 'reassign', 'upgrade', 'acquire'];
  const globalGapCounts = Object.fromEntries(
    globalGapActionOrder.map((action) => [
      action,
      activeMatching.gaps.filter((g) => g.recommendedAction === action).length,
    ])
  ) as Record<GapActionType, number>;

  const visibleGlobalGaps =
      gapFilter === 'all'
      ? [...activeMatching.gaps].sort(
          (a, b) =>
            globalGapActionOrder.indexOf(a.recommendedAction) -
            globalGapActionOrder.indexOf(b.recommendedAction)
        )
      : activeMatching.gaps.filter((g) => g.recommendedAction === gapFilter);
  const totalAssignedDelta = activeMatching.totalAssigned - baselineMatching.totalAssigned;
  const totalRequiredDelta = activeMatching.totalRequired - baselineMatching.totalRequired;
  const selectedAssignedDelta =
    selectedCoverage && selectedBaselineCoverage
      ? selectedCoverage.assignedCount - selectedBaselineCoverage.assignedCount
      : null;

  if (!matching || matching.totalRequired === 0) {
    return (
      <section className="mt-6">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5 text-sm text-gray-400">
          No platoon slot data available for matching analysis.
        </div>
      </section>
    );
  }

  const handleCoverageSelect = (phase: number, category: PlanetCategory) => {
    setSelectedPlatoonKey('all');
    onSelectCoverageCell({ phase, category });
  };

  const handleToggleIgnoreScope = (scope: IgnoredMatchingScope) => {
    runScenarioOverlay(() => {
      setSelectedPlatoonKey('all');
      setGapFilter('all');
      if (
        activeSelectedCoverageCell &&
        getIgnoredMatchingScopeKey(activeSelectedCoverageCell) === getIgnoredMatchingScopeKey(scope)
      ) {
        onSelectCoverageCell(null);
      }
      setIgnoredScopes((previous) => {
        const next = isIgnoredMatchingScope(previous, scope)
          ? previous.filter(
              (entry) =>
                getIgnoredMatchingScopeKey(entry) !== getIgnoredMatchingScopeKey(scope),
            )
          : [...previous, scope];

        return normalizeIgnoredMatchingScopes(next);
      });
    });
  };

  return (
    <section className="relative mt-6 space-y-8">
      <WorkingOverlay
        active={isScenarioUpdating}
        title="Updating matching"
        description="Recomputing the best assignment plan for the current scenario."
        className="rounded-3xl"
      />
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Matching
            </p>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-indigo-200">
                Phase × Category Coverage
              </h3>

              {discordExport && (
                <button
                  onClick={() => navigator.clipboard.writeText(discordExport)}
                  className="rounded-lg border border-indigo-900 bg-indigo-950/40 px-3 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-950/70"
                >
                  Copy Discord export
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-emerald-200">
              {activeMatching.totalAssigned} assigned
            </span>
            <span className="rounded-full border border-red-900 bg-red-950/40 px-3 py-1 text-red-200">
              {activeMatching.gaps.length} gaps
            </span>
            <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
              {activeMatching.coveragePercent}% overall
            </span>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-950/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Ignore For This Scenario
              </p>
              <p className="mt-2 text-sm text-gray-400">
                Ignored scopes are removed from the solve and their units no longer compete with
                the remaining scopes.
              </p>
            </div>
            {sanitizedIgnoredScopes.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  runScenarioOverlay(() => {
                    setGapFilter('all');
                    setSelectedPlatoonKey('all');
                    setIgnoredScopes([]);
                  })
                }
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-gray-600 hover:bg-gray-800"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {sanitizedIgnoredScopes.length > 0 ? (
              sanitizedIgnoredScopes.map((scope) => (
                <button
                  key={getIgnoredMatchingScopeKey(scope)}
                  type="button"
                  onClick={() => handleToggleIgnoreScope(scope)}
                  className="rounded-full border border-red-900 bg-red-950/30 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-950/50"
                >
                  {formatIgnoredMatchingScopeLabel(scope)} ×
                </button>
              ))
            ) : (
              <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-400">
                No ignored scopes
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <MetricCard
            title="Baseline"
            value={`${matching.totalAssigned}/${matching.totalRequired}`}
            detail={`${matching.coveragePercent}% coverage before scenario filters`}
            tone="info"
          />
          <MetricCard
            title="Scenario"
            value={`${activeMatching.totalAssigned}/${activeMatching.totalRequired}`}
            detail={`${activeMatching.coveragePercent}% coverage after ignored scopes`}
            tone={sanitizedIgnoredScopes.length > 0 ? 'warning' : 'positive'}
          />
          <MetricCard
            title="Delta covered"
            value={`${totalAssignedDelta >= 0 ? '+' : ''}${totalAssignedDelta}`}
            detail="Assigned slots gained or lost under the scenario"
            tone={totalAssignedDelta >= 0 ? 'positive' : 'warning'}
          />
          <MetricCard
            title="Delta required"
            value={`${totalRequiredDelta >= 0 ? '+' : ''}${totalRequiredDelta}`}
            detail={
              activeSelectedCoverageCell && selectedAssignedDelta !== null
                ? `${formatIgnoredMatchingScopeLabel(activeSelectedCoverageCell)} delta assigned ${selectedAssignedDelta >= 0 ? '+' : ''}${selectedAssignedDelta}`
                : 'Select a scope to compare local assignment deltas'
            }
            tone={selectedAssignedDelta == null || selectedAssignedDelta >= 0 ? 'info' : 'warning'}
          />
        </div>

        <div className="mt-5">
          <CoverageGrid
            coverage={activeMatching.coverage}
            referenceCoverage={matching.coverage}
            selectedCell={activeSelectedCoverageCell}
            ignoredScopes={sanitizedIgnoredScopes}
            onSelect={handleCoverageSelect}
            onToggleIgnore={handleToggleIgnoreScope}
          />
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Each cell shows assigned / required slots. Colour: green ≥ 100% · blue ≥ 75% · amber ≥
          40% · red &lt; 40%. Use Ignore to remove a phase/category scope from this scenario and
          recalculate the optimum for the remaining scopes.
        </p>
      </div>

      {activeSelectedCoverageCell && selectedCoverage && (
        <>
          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Selected Scope
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  P{selectedCoverage.phase} ·{' '}
                  {getMatchingCategoryLabel(selectedCoverage.category)}
                  {selectedPlatoonLabel
                    ? ` · ${formatPlatoonTitle({
                        platoonNumber: selectedPlatoonLabel.platoonNumber,
                        platoonKey: selectedPlatoonLabel.platoonKey,
                      })}`
                    : ''}
                </h3>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-emerald-200">
                  {selectedScopeAssignedCount} assigned
                </span>
                <span className="rounded-full border border-red-900 bg-red-950/40 px-3 py-1 text-red-200">
                  {filteredSelectedGaps.length} open
                </span>
                <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
                  {selectedScopeCoveragePercent}% coverage
                </span>
              </div>
            </div>

            {availableSelectedPlatoons.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <FilterPill
                  label="All platoons"
                  active={effectiveSelectedPlatoonKey === 'all'}
                  onClick={() => setSelectedPlatoonKey('all')}
                />
                {availableSelectedPlatoons.map((platoon, index) => (
                  <FilterPill
                    key={platoon.platoonKey}
                    label={formatPlatoonTitle({
                      platoonNumber: platoon.platoonNumber,
                      platoonKey: platoon.platoonKey,
                      fallbackIndex: index,
                    })}
                    active={effectiveSelectedPlatoonKey === platoon.platoonKey}
                    onClick={() => setSelectedPlatoonKey(platoon.platoonKey)}
                    secondary
                  />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Gap Analysis
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {filteredSelectedGaps.length} unresolved slot
                  {filteredSelectedGaps.length === 1 ? '' : 's'} in this scope
                </h3>
              </div>
              <p className="max-w-sm text-sm text-gray-400">
                Only the open slots for the selected phase/category{selectedPlatoonLabel ? '/platoon' : ''}.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <FilterPill
                label="All"
                active={gapFilter === 'all'}
                onClick={() => setGapFilter('all')}
              />
              {selectedGapActionOrder.map((action) =>
                selectedGapCounts[action] > 0 ? (
                  <FilterPill
                    key={action}
                    label={`${GAP_ACTION_META[action].label} (${selectedGapCounts[action]})`}
                    active={gapFilter === action}
                    onClick={() => setGapFilter(action)}
                    secondary
                  />
                ) : null
              )}
            </div>

            {gapFilter !== 'all' && visibleSelectedGaps.length > 0 && (
              <p className="mt-3 text-xs text-gray-500">{GAP_ACTION_META[gapFilter].detail}</p>
            )}

            <div className="mt-4 space-y-2">
              {visibleSelectedGaps.length > 0 ? (
                visibleSelectedGaps.map((gap) => <GapCard key={gap.requirementId} gap={gap} />)
              ) : (
                <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-100">
                  No open slots in the current filter for this phase/category.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Platoon Detail
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Assignments and open slots by platoon
                </h3>
                
              </div>
              <p className="max-w-sm text-sm text-gray-400">
                Compact slot view for the selected phase/category.
              </p>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {visibleSelectedPlatoons.length > 0 ? (
                visibleSelectedPlatoons.map((platoon, index) => (
                  <div
                    key={platoon.platoonKey}
                    className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-white">
                          {formatPlatoonTitle({
                            platoonNumber: platoon.platoonNumber,
                            platoonKey: platoon.platoonKey,
                            fallbackIndex: index,
                          })}
                        </h4>
                        <p className="mt-1 text-xs text-gray-500">
                          {platoon.zoneName} · {platoon.platoonKey}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs ${
                          platoon.openCount > 0
                            ? 'border-amber-900 bg-amber-950/40 text-amber-200'
                            : 'border-emerald-900 bg-emerald-950/40 text-emerald-200'
                        }`}
                      >
                        {platoon.openCount > 0
                          ? `${platoon.assignedCount}/${platoon.totalCount} filled`
                          : 'Complete'}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {platoon.rows.map((row) =>
                        row.kind === 'assigned' ? (
                          <div
                            key={row.requirementId}
                            className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm text-white">
                                {row.slotNumber}. {row.unitName}
                              </div>
                              <div className="text-sm text-gray-300">{row.playerName}</div>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={row.requirementId}
                            className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3"
                          >
                            <div className="text-sm text-white">
                              {row.slotNumber}. {row.unitName}
                              {' -> OPEN'}
                            </div>
                            <div className="mt-1 text-xs text-amber-200">
                              Best next action: {row.action}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-100">
                  No platoon rows are visible in this scope.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!activeSelectedCoverageCell && activeMatching.gaps.length > 0 && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Gap Analysis
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                {activeMatching.gaps.length} unresolved slot
                {activeMatching.gaps.length === 1 ? '' : 's'}
              </h3>
            </div>
            <p className="max-w-sm text-sm text-gray-400">
              Select a coverage cell above for a scoped drilldown, or review the global gap list
              here.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <FilterPill
              label="All"
              active={gapFilter === 'all'}
              onClick={() => setGapFilter('all')}
            />
            {globalGapActionOrder.map((action) =>
              globalGapCounts[action] > 0 ? (
                <FilterPill
                  key={action}
                  label={`${GAP_ACTION_META[action].label} (${globalGapCounts[action]})`}
                  active={gapFilter === action}
                  onClick={() => setGapFilter(action)}
                  secondary
                />
              ) : null
            )}
          </div>

          {gapFilter !== 'all' && (
            <p className="mt-3 text-xs text-gray-500">{GAP_ACTION_META[gapFilter].detail}</p>
          )}

          <div className="mt-4 space-y-2">
            {visibleGlobalGaps.map((gap) => (
              <GapCard key={gap.requirementId} gap={gap} />
            ))}
          </div>
        </div>
      )}

      {activeMatching.totalRequired === 0 && sanitizedIgnoredScopes.length > 0 && (
        <div className="rounded-2xl border border-blue-900 bg-blue-950/30 p-5 text-sm text-blue-100">
          Every phase/category scope is currently ignored. Restore one or more scopes above to see
          the recomputed matching result.
        </div>
      )}

      {activeMatching.totalRequired > 0 && activeMatching.gaps.length === 0 && (
        <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-5 text-sm text-emerald-100">
          Every platoon slot has a valid assignment. The guild can fully cover all imported platoon
          requirements under the current matching scenario.
        </div>
      )}
    </section>
  );
}

function formatBestNextAction(gap: PlatoonMatchingGap) {
  const source = gap.possibleSources?.[0];

  if (gap.recommendedAction === 'use_unused' && source) {
    return `Assign ${source.playerName}`;
  }

  if (gap.recommendedAction === 'upgrade' && source) {
    const parts: string[] = [];
    if (source.missingRelicTiers > 0) parts.push(`+${source.missingRelicTiers} relic`);
    if (source.missingRarity > 0) parts.push(`+${source.missingRarity} star`);
    return `Upgrade ${source.playerName}${parts.length ? ` (${parts.join(', ')})` : ''}`;
  }

  if (gap.recommendedAction === 'reassign' && source) {
    return `Reassign ${source.playerName}`;
  }

  return 'Acquire or unlock unit';
}

function MemberTargetsView({
  summary,
  strategicTargets,
  targetOpportunities,
  assignedMemberCount,
  unassignedPriorityCount,
  canManageTargets,
  fixtureMode,
  busyActionKey,
  onAssignTarget,
  onRemoveTarget,
  prioritiesHref,
  overviewHref,
  publicTargetsHref,
}: {
  summary: StrategicPlannerSummary | null;
  strategicTargets: StrategicTargetAssignment[];
  targetOpportunities: StrategicUnitImpact[];
  assignedMemberCount: number;
  unassignedPriorityCount: number;
  canManageTargets: boolean;
  fixtureMode: boolean;
  busyActionKey: string | null;
  onAssignTarget: (
    guildMemberId: string,
    unitBaseId: string,
    memberName: string,
    unitName: string,
    planetCategory: PlanetCategory | null
  ) => Promise<void>;
  onRemoveTarget: (assignmentId: string, memberName: string, unitName: string) => Promise<void>;
  prioritiesHref: string;
  overviewHref: string;
  publicTargetsHref: string | null;
}) {
  const accessValue = fixtureMode ? 'Demo' : canManageTargets ? 'Enabled' : 'Read only';
  const accessDetail = fixtureMode
    ? 'Assignments render in fixture mode, but assign and remove stays disabled.'
    : canManageTargets
      ? 'You can assign and remove strategic targets in this workspace.'
      : 'Owners, admins, and officers can manage targets here.';
  const memberTargetGroups = groupStrategicTargetsByMember(strategicTargets);

  if (!summary && strategicTargets.length === 0 && targetOpportunities.length === 0) {
    return (
      <PlannerEmptyState
        title="Member targets are waiting for planner data"
        body="Once readiness analysis is available, this workspace will show assigned targets and the best candidate-to-target matches."
      />
    );
  }

  return (
    <section className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            Member Targets
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Turn priorities into ownership
          </h2>
        </div>
        <p className="max-w-3xl text-sm text-gray-400">
          Use this workspace to review assigned build targets, check who is already carrying work,
          and move from strategic analysis into member-level planning.
        </p>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Active targets"
          value={`${strategicTargets.length}`}
          detail="Current build commitments for long-term platoon readiness"
          tone={strategicTargets.length > 0 ? 'info' : 'warning'}
        />
        <MetricCard
          title="Targeted members"
          value={`${assignedMemberCount}`}
          detail="Guild members currently carrying at least one strategic target"
          tone={assignedMemberCount > 0 ? 'positive' : 'info'}
        />
        <MetricCard
          title="Unassigned priorities"
          value={`${unassignedPriorityCount}`}
          detail="High-priority units without any active ownership target"
          tone={unassignedPriorityCount > 0 ? 'warning' : 'positive'}
        />
        <MetricCard
          title="Assignment access"
          value={accessValue}
          detail={accessDetail}
          tone={fixtureMode ? 'warning' : canManageTargets ? 'positive' : 'info'}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Member Load
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Assignment capacity by member
            </h3>
          </div>
          {publicTargetsHref && (
            <Link
              href={publicTargetsHref}
              target="_blank"
              className="text-sm font-medium text-blue-300 transition-colors hover:text-blue-200"
            >
              Open public targets board
            </Link>
          )}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {memberTargetGroups.length > 0 ? (
            memberTargetGroups.map((group) => (
              <MemberCapacityCard key={group.guildMemberId} group={group} />
            ))
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-300 xl:col-span-2">
              No strategic build targets have been assigned yet.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Current Strategic Targets
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Assigned ownership commitments
            </h3>
          </div>
          <Link
            href={overviewHref}
            className="text-sm font-medium text-blue-300 transition-colors hover:text-blue-200"
          >
            Back to overview
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {strategicTargets.length > 0 ? (
            strategicTargets.map((assignment) => (
              <StrategicTargetCard
                key={assignment.id}
                assignment={assignment}
                canManageTargets={canManageTargets}
                fixtureMode={fixtureMode}
                busyActionKey={busyActionKey}
                onRemoveTarget={onRemoveTarget}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-300">
              No strategic build targets have been assigned yet.
            </div>
          )}
        </div>

        {fixtureMode && (
          <p className="mt-4 text-sm text-amber-200">
            Demo strategic targets are read-only in fixture mode.
          </p>
        )}

        {!fixtureMode && !canManageTargets && (
          <p className="mt-4 text-sm text-gray-500">
            Owners, admins, and officers can assign or remove strategic targets.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Recommended Next Targets
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Candidate-to-target workflow
            </h3>
          </div>
          <Link
            href={prioritiesHref}
            className="text-sm font-medium text-blue-300 transition-colors hover:text-blue-200"
          >
            Review full priorities
          </Link>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {targetOpportunities.length > 0 ? (
            targetOpportunities.map((unit, index) => (
              <TargetOpportunityCard
                key={unit.unitBaseId}
                unit={unit}
                rank={index + 1}
                canManageTargets={canManageTargets}
                fixtureMode={fixtureMode}
                busyActionKey={busyActionKey}
                onAssignTarget={onAssignTarget}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-300 xl:col-span-2">
              No candidate workflows are queued yet. Review Missing Units to find the next
              ownership targets worth assigning.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function PlannerLoadingShell() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-800" />
          <div className="mt-4 h-10 w-80 animate-pulse rounded bg-gray-800" />
          <div className="mt-3 h-4 w-96 animate-pulse rounded bg-gray-800" />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5"
            >
              <div className="h-4 w-24 animate-pulse rounded bg-gray-800" />
              <div className="mt-4 h-8 w-24 animate-pulse rounded bg-gray-800" />
              <div className="mt-3 h-4 w-32 animate-pulse rounded bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function groupZonesByPhase(zones: StrategicZoneReadiness[]) {
  const grouped = new Map<number, StrategicZoneReadiness[]>();

  for (const zone of zones) {
    const existing = grouped.get(zone.phase);
    if (existing) {
      existing.push(zone);
      continue;
    }

    grouped.set(zone.phase, [zone]);
  }

  return [...grouped.entries()].sort(([left], [right]) => left - right);
}

type MemberTargetGroup = {
  guildMemberId: string;
  memberName: string;
  allyCode: string;
  load: StrategicMemberAssignmentLoad;
  targets: StrategicTargetAssignment[];
};

function groupStrategicTargetsByMember(
  assignments: StrategicTargetAssignment[]
): MemberTargetGroup[] {
  const groups = new Map<string, MemberTargetGroup>();

  for (const assignment of assignments) {
    const existing = groups.get(assignment.guildMemberId);
    if (existing) {
      existing.targets.push(assignment);
      continue;
    }

    groups.set(assignment.guildMemberId, {
      guildMemberId: assignment.guildMemberId,
      memberName: assignment.memberName,
      allyCode: assignment.allyCode,
      load: assignment.memberAssignmentLoad,
      targets: [assignment],
    });
  }

  return [...groups.values()]
    .sort((left, right) => {
      if (right.load.TOTAL !== left.load.TOTAL) {
        return right.load.TOTAL - left.load.TOTAL;
      }

      return left.memberName.localeCompare(right.memberName);
    })
    .map((group) => ({
      ...group,
      targets: [...group.targets].sort((left, right) => left.unitName.localeCompare(right.unitName)),
    }));
}

function getUncategorizedAssignmentCount(load: StrategicMemberAssignmentLoad) {
  return Math.max(load.TOTAL - load.LS - load.DS - load.MIX - load.SPECIAL, 0);
}

function formatCapacityCategoryCount(
  category: PlanetCategory,
  load: StrategicMemberAssignmentLoad
) {
  return `${category}: ${load[category]} / ${MAX_STATIONS_PER_MEMBER_PER_PLANET}`;
}

function formatCandidateCapacity(candidate: StrategicTargetCandidate) {
  if (candidate.capacityCategory) {
    return `${candidate.capacityCategory} ${candidate.capacityLoad[candidate.capacityCategory]}/${MAX_STATIONS_PER_MEMBER_PER_PLANET}`;
  }

  const uncategorized = getUncategorizedAssignmentCount(candidate.capacityLoad);
  return uncategorized > 0
    ? `Category pending, ${candidate.capacityLoad.TOTAL} total assignments (${uncategorized} uncategorized)`
    : `Category pending, ${candidate.capacityLoad.TOTAL} total assignments`;
}

function formatAssignmentCapacity(assignment: StrategicTargetAssignment) {
  if (assignment.planetCategory) {
    return `Capacity ${assignment.planetCategory} ${assignment.memberAssignmentLoad[assignment.planetCategory]}/${MAX_STATIONS_PER_MEMBER_PER_PLANET}`;
  }

  const uncategorized = getUncategorizedAssignmentCount(assignment.memberAssignmentLoad);
  return uncategorized > 0
    ? `Capacity category pending (${uncategorized} uncategorized)`
    : 'Capacity category pending';
}

function HeaderPill({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'positive' | 'warning' | 'info';
}) {
  const toneClasses = {
    neutral: 'border-gray-800 bg-gray-900 text-gray-300',
    positive: 'border-emerald-900 bg-emerald-950/50 text-emerald-200',
    warning: 'border-amber-900 bg-amber-950/50 text-amber-200',
    info: 'border-blue-900 bg-blue-950/50 text-blue-200',
  };

  return <span className={`rounded-full border px-3 py-1 ${toneClasses[tone]}`}>{label}</span>;
}

function PlannerEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-8">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm text-gray-400">{body}</p>
    </section>
  );
}

function Banner({
  title,
  body,
  tone,
  className,
}: {
  title: string;
  body: string;
  tone: 'warning' | 'error' | 'success';
  className?: string;
}) {
  const toneClasses = {
    warning: 'border-amber-900 bg-amber-950/30 text-amber-100',
    error: 'border-red-900 bg-red-950/30 text-red-100',
    success: 'border-emerald-900 bg-emerald-950/30 text-emerald-100',
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]} ${className ?? ''}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{body}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: 'positive' | 'warning' | 'danger' | 'info';
}) {
  const toneClasses = {
    positive: 'border-emerald-900 bg-emerald-950/30',
    warning: 'border-amber-900 bg-amber-950/30',
    danger: 'border-red-900 bg-red-950/30',
    info: 'border-blue-900 bg-blue-950/30',
  };

  return (
    <div className={`rounded-2xl border p-5 ${toneClasses[tone]}`}>
      <p className="text-sm text-gray-400">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function CapacitySummaryLine({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'danger';
}) {
  const toneClasses = {
    neutral: 'border-gray-800 bg-gray-950/60 text-gray-200',
    danger: 'border-red-900 bg-red-950/40 text-red-100',
  };

  return (
    <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${toneClasses[tone]}`}>
      <span>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function MemberCapacityCard({ group }: { group: MemberTargetGroup }) {
  const uncategorizedCount = getUncategorizedAssignmentCount(group.load);

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white">{group.memberName}</h4>
          <p className="mt-1 font-mono text-xs text-gray-500">{group.allyCode}</p>
        </div>
        <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300">
          Assignments: {group.load.TOTAL}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(['LS', 'DS', 'MIX', 'SPECIAL'] as PlanetCategory[]).map((category) => (
          <div
            key={category}
            className="rounded-2xl border border-gray-800 bg-gray-900/70 px-4 py-3 text-sm text-gray-200"
          >
            {formatCapacityCategoryCount(category, group.load)}
          </div>
        ))}
        {uncategorizedCount > 0 && (
          <div className="rounded-2xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            Category pending: {uncategorizedCount}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {group.targets.map((target) => (
          <span
            key={target.id}
            className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300"
          >
            {target.unitName}
          </span>
        ))}
      </div>
    </div>
  );
}

function CompactMissingUnitRow({
  unit,
  rank,
}: {
  unit: StrategicUnitImpact;
  rank: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-900 bg-blue-950/50 px-3 py-1 text-xs font-semibold text-blue-200">
              #{rank}
            </span>
            <p className="text-sm font-medium text-white">{unit.unitName}</p>
            <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300">
              {formatConstraintLabel(unit.primaryConstraint)}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-400">{unit.reasonSummary}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-red-900 bg-red-950/40 px-3 py-1 text-red-200">
            Impact {unit.impactScore}
          </span>
          <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
            {unit.blockedSlots} blocked slots
          </span>
        </div>
      </div>
    </div>
  );
}

function CompactZoneRow({ zone }: { zone: StrategicZoneReadiness }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">
              Phase {zone.phase} {zone.zoneName}
            </p>
            <span
              className={`rounded-full border px-3 py-1 text-xs ${
                zone.status === 'ready'
                  ? 'border-emerald-900 bg-emerald-950/50 text-emerald-200'
                  : zone.status === 'partial'
                    ? 'border-amber-900 bg-amber-950/50 text-amber-200'
                    : 'border-red-900 bg-red-950/50 text-red-200'
              }`}
            >
              {zone.status === 'partial' ? 'Partially blocked' : zone.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {zone.estimatedCoverablePlatoons}/{zone.totalPlatoons} platoons coverable with{' '}
            {zone.missingSlots} missing slot{zone.missingSlots === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
            {zone.coverableSlots}/{zone.totalSlots} slots
          </span>
          <span className="rounded-full border border-amber-900 bg-amber-950/40 px-3 py-1 text-amber-200">
            {zone.blockedPlatoons} blocked platoon{zone.blockedPlatoons === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}

function TargetCandidateRow({
  candidate,
  unitBaseId,
  unitName,
  canManageTargets,
  fixtureMode,
  busyActionKey,
  onAssignTarget,
}: {
  candidate: StrategicTargetCandidate;
  unitBaseId: string;
  unitName: string;
  canManageTargets: boolean;
  fixtureMode: boolean;
  busyActionKey: string | null;
  onAssignTarget: (
    guildMemberId: string,
    unitBaseId: string,
    memberName: string,
    unitName: string,
    planetCategory: PlanetCategory | null
  ) => Promise<void>;
}) {
  const actionKey = `assign:${candidate.guildMemberId}:${unitBaseId}`;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/70 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">{candidate.memberName}</p>
            <TargetStateBadge state={candidate.state} />
            <span className="rounded-full border border-blue-900 bg-blue-950/50 px-3 py-1 text-xs text-blue-200">
              Score {candidate.score}
            </span>
            {candidate.existingStrategicTargetCount > 0 && (
              <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300">
                {candidate.existingStrategicTargetCount} other target
                {candidate.existingStrategicTargetCount === 1 ? '' : 's'}
              </span>
            )}
            {candidate.capacityReached && (
              <span className="rounded-full border border-red-900 bg-red-950/50 px-3 py-1 text-xs text-red-200">
                Capacity reached
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-400">{candidate.reasonSummary}</p>
          <p className="mt-2 text-xs text-gray-500">
            {formatCandidateProgress(candidate, unitName)}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Capacity: {formatCandidateCapacity(candidate)}
          </p>
        </div>

        {canManageTargets && !fixtureMode && (
          <button
            onClick={() =>
              void onAssignTarget(
                candidate.guildMemberId,
                unitBaseId,
                candidate.memberName,
                unitName,
                candidate.capacityCategory
              )
            }
            disabled={
              candidate.isAlreadyAssigned || candidate.capacityReached || busyActionKey === actionKey
            }
            className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
          >
            {candidate.isAlreadyAssigned
              ? 'Assigned'
              : candidate.capacityReached
                ? 'Capacity reached'
              : busyActionKey === actionKey
                ? 'Assigning...'
                : 'Assign target'}
          </button>
        )}
      </div>
    </div>
  );
}

function TargetOpportunityCard({
  unit,
  rank,
  canManageTargets,
  fixtureMode,
  busyActionKey,
  onAssignTarget,
}: {
  unit: StrategicUnitImpact;
  rank: number;
  canManageTargets: boolean;
  fixtureMode: boolean;
  busyActionKey: string | null;
  onAssignTarget: (
    guildMemberId: string,
    unitBaseId: string,
    memberName: string,
    unitName: string,
    planetCategory: PlanetCategory | null
  ) => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-900 bg-blue-950/50 px-3 py-1 text-xs font-semibold text-blue-200">
              Priority #{rank}
            </span>
            <h4 className="text-lg font-semibold text-white">{unit.unitName}</h4>
            {unit.primaryPlanetCategory && (
              <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs text-blue-200">
                {unit.primaryPlanetCategory}
              </span>
            )}
            <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300">
              {formatConstraintLabel(unit.primaryConstraint)}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-400">{unit.reasonSummary}</p>
        </div>
        <span className="rounded-full border border-red-900 bg-red-950/50 px-3 py-1 text-sm text-red-200">
          Impact {unit.impactScore}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
          {unit.blockedSlots} blocked slots
        </span>
        <span className="rounded-full border border-amber-900 bg-amber-950/40 px-3 py-1 text-amber-200">
          {unit.limitingZones} primary zone{unit.limitingZones === 1 ? '' : 's'}
        </span>
        <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-blue-200">
          {unit.assignmentCount > 0
            ? `${unit.assignmentCount} active target${unit.assignmentCount === 1 ? '' : 's'}`
            : 'No active target yet'}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {unit.bestCandidates.slice(0, 3).map((candidate) => (
          <TargetCandidateRow
            key={`${unit.unitBaseId}-${candidate.guildMemberId}`}
            candidate={candidate}
            unitBaseId={unit.unitBaseId}
            unitName={unit.unitName}
            canManageTargets={canManageTargets}
            fixtureMode={fixtureMode}
            busyActionKey={busyActionKey}
            onAssignTarget={onAssignTarget}
          />
        ))}
      </div>
    </div>
  );
}

function computeUnitDemand(
  unitBaseId: string,
  slotSummaries: StrategicRequirementSummary[],
  scope: { phase: number | 'all'; zoneKey: string | 'all'; platoonKey: string | 'all' }
) {
  const slots = slotSummaries.filter((s) => s.unitBaseId === unitBaseId);

  const platoonRequired =
    scope.platoonKey !== 'all' ? slots.filter((s) => s.platoonKey === scope.platoonKey).length : 0;

  const zoneRequired =
    scope.zoneKey !== 'all' ? slots.filter((s) => s.zoneKey === scope.zoneKey).length : 0;

  const phaseRequired =
    scope.phase !== 'all' ? slots.filter((s) => s.phase === scope.phase).length : 0;

  const bonusRequired =
    scope.phase !== 'all'
      ? slots.filter((s) => s.phase === scope.phase && s.isBonus).length
      : 0;

  // Scoped blocked metrics for ranking in filtered views.
  const scopedSlots =
    scope.platoonKey !== 'all'
      ? slots.filter((s) => s.platoonKey === scope.platoonKey)
      : scope.zoneKey !== 'all'
      ? slots.filter((s) => s.zoneKey === scope.zoneKey)
      : scope.phase !== 'all'
        ? slots.filter((s) => s.phase === scope.phase)
        : slots;
  const blockedSlotsInScope = scopedSlots.filter((s) => s.blocked).length;
  const blockedPlatoonsInScope = new Set(
    scopedSlots.filter((s) => s.blocked).map((s) => s.platoonKey)
  ).size;

  return {
    platoonRequired,
    zoneRequired,
    phaseRequired,
    bonusRequired,
    blockedSlotsInScope,
    blockedPlatoonsInScope,
  };
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

function buildPlannerPlatoonCards(
  slotSummaries: StrategicRequirementSummary[],
  scope: { phase: number | 'all'; zoneKey: string | 'all'; platoonKey: string | 'all' }
): PlannerPlatoonCardData[] {
  const summariesInScope = slotSummaries.filter((summary) => {
    if (scope.phase !== 'all' && summary.phase !== scope.phase) return false;
    if (scope.zoneKey !== 'all' && summary.zoneKey !== scope.zoneKey) return false;
    if (scope.platoonKey !== 'all' && summary.platoonKey !== scope.platoonKey) return false;
    return true;
  });

  const grouped = new Map<string, PlannerPlatoonCardData>();

  for (const summary of summariesInScope) {
    const existing = grouped.get(summary.platoonKey);
    const slot = {
      slotKey: summary.slotKey,
      slotNumber: summary.slotNumber,
      unitName: summary.unitName ?? summary.unitBaseId,
      status: summary.status,
    };

    if (existing) {
      existing.totalSlots += 1;
      existing.filledSlots += summary.status === 'covered' ? 1 : 0;
      existing.missingSlots += summary.status === 'covered' ? 0 : 1;
      existing.slots.push(slot);
      continue;
    }

    grouped.set(summary.platoonKey, {
      phase: summary.phase,
      zoneKey: summary.zoneKey,
      zoneName: summary.zoneName,
      platoonKey: summary.platoonKey,
      platoonNumber: summary.platoonNumber,
      totalSlots: 1,
      filledSlots: summary.status === 'covered' ? 1 : 0,
      missingSlots: summary.status === 'covered' ? 0 : 1,
      status: 'ready' as PlannerPlatoonCardData['status'],
      slots: [slot],
    });
  }

  return [...grouped.values()]
    .map((platoon) => {
      const sortedSlots = platoon.slots.toSorted((left, right) => left.slotNumber - right.slotNumber);
      const status: PlannerPlatoonCardData['status'] =
        platoon.missingSlots === 0
          ? 'ready'
          : platoon.filledSlots === 0
            ? 'blocked'
            : 'partial';

      return {
        ...platoon,
        status,
        slots: sortedSlots,
      };
    })
    .toSorted((left, right) => {
      if (left.phase !== right.phase) return left.phase - right.phase;
      if (left.zoneName !== right.zoneName) return left.zoneName.localeCompare(right.zoneName);
      return left.platoonNumber - right.platoonNumber;
    });
}

function formatPlannerSlotStatus(status: StrategicRequirementSummary['status']) {
  switch (status) {
    case 'covered':
      return {
        label: 'Covered',
        className: 'border-emerald-900 bg-emerald-950/40 text-emerald-200',
      };
    case 'ownership_shortage':
      return {
        label: 'Ownership shortage',
        className: 'border-amber-900 bg-amber-950/40 text-amber-200',
      };
    case 'near_miss':
      return {
        label: 'Near miss',
        className: 'border-blue-900 bg-blue-950/40 text-blue-200',
      };
    default:
      return {
        label: 'Hard missing',
        className: 'border-red-900 bg-red-950/40 text-red-200',
      };
  }
}

function MissingUnitCard({
  unit,
  rank,
  bucket,
  slotSummaries,
  selectedPhase,
  selectedZone,
  selectedPlatoon,
  candidateLimit = 4,
  canManageTargets,
  fixtureMode,
  busyActionKey,
  onAssignTarget,
}: {
  unit: StrategicUnitImpact;
  rank: number;
  bucket?: ProgressionBucket;
  slotSummaries: StrategicRequirementSummary[];
  selectedPhase: number | 'all';
  selectedZone: string | 'all';
  selectedPlatoon: string | 'all';
  candidateLimit?: number;
  canManageTargets: boolean;
  fixtureMode: boolean;
  busyActionKey: string | null;
  onAssignTarget: (
    guildMemberId: string,
    unitBaseId: string,
    memberName: string,
    unitName: string,
    planetCategory: PlanetCategory | null
  ) => Promise<void>;
}) {
  const shortagePercent = Math.round(unit.shortageRatio * 100);
  const demand = computeUnitDemand(unit.unitBaseId, slotSummaries, {
    phase: selectedPhase,
    zoneKey: selectedZone,
    platoonKey: selectedPlatoon,
  });

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-900 bg-blue-950/50 text-sm font-semibold text-blue-200">
            #{rank}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{unit.unitName}</h3>
              {unit.primaryPlanetCategory && (
                <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs text-blue-200">
                  {unit.primaryPlanetCategory}
                </span>
              )}
              <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-300">
                {formatConstraintLabel(unit.primaryConstraint)}
              </span>
              {bucket && <ProgressionBucketBadge bucket={bucket} />}
            </div>
            <p className="mt-2 text-sm text-gray-400">
              {selectedPlatoon !== 'all'
                ? `Required in ${demand.platoonRequired} slot${demand.platoonRequired === 1 ? '' : 's'} for this platoon`
                : selectedZone !== 'all'
                ? `Required in ${demand.zoneRequired} slot${demand.zoneRequired === 1 ? '' : 's'} for this zone`
                : selectedPhase !== 'all'
                  ? `Required in ${demand.phaseRequired} slot${demand.phaseRequired === 1 ? '' : 's'} across this phase`
                  : unit.reasonSummary}
            </p>
            {(selectedPlatoon !== 'all' || selectedZone !== 'all' || selectedPhase !== 'all') && (
              <p className="mt-1 text-xs text-gray-500">{unit.reasonSummary}</p>
            )}
          </div>
        </div>
        <span className="rounded-full border border-red-900 bg-red-950/50 px-3 py-1 text-sm text-red-200">
          Impact {unit.impactScore}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <StatChip
          label={selectedPlatoon !== 'all' ? 'Plat req' : 'Zone req'}
          value={`${selectedPlatoon !== 'all' ? demand.platoonRequired : demand.zoneRequired}`}
        />
        <StatChip label="Phase req" value={`${demand.phaseRequired}`} />
        <StatChip label="Bonus req" value={`${demand.bonusRequired}`} />
        <StatChip label="Guild" value={`${unit.uniqueOwners}`} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <StatChip
          label={
            selectedPlatoon !== 'all' || selectedZone !== 'all' || selectedPhase !== 'all'
              ? 'Blocked (scope)'
              : 'Blocked slots'
          }
          value={`${
            selectedPlatoon !== 'all' || selectedZone !== 'all' || selectedPhase !== 'all'
              ? demand.blockedSlotsInScope
              : unit.blockedSlots
          }`}
        />
        <StatChip label="Primary zones" value={`${unit.limitingZones}`} />
        <StatChip label="Upgradeable" value={`${unit.estimatedUnlockSlots}`} />
        <StatChip label="Hard missing" value={`${unit.hardMissingSlots}`} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-900">
        <div
          className="h-full bg-blue-400"
          style={{
            width: `${Math.round((unit.coverableSlots / unit.totalRequiredSlots) * 100)}%`,
          }}
        />
      </div>

      <p className="mt-3 text-sm text-gray-500">
        Shortage depth {shortagePercent}%.{' '}
        {unit.isShipUnit
          ? unit.strictestRequirement.minRelic > 0
            ? `Strictest requirement: ${unit.strictestRequirement.minRarity}★ ship (crew relic threshold: R${unit.strictestRequirement.minRelic}).`
            : `Strictest requirement: ${unit.strictestRequirement.minRarity}★ ship.`
          : `Strictest requirement: R${unit.strictestRequirement.minRelic} and ${unit.strictestRequirement.minRarity} stars.`}{' '}
        Near miss pressure affects {unit.nearMissSlots} blocked slot
        {unit.nearMissSlots === 1 ? '' : 's'}.
      </p>

      <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Candidate Suggestions
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Secondary guidance for turning this unit priority into an ownership target.
            </p>
          </div>
          <p className="text-sm text-gray-500">
            {unit.assignmentCount > 0
              ? `${unit.assignmentCount} active target${unit.assignmentCount === 1 ? '' : 's'}: ${unit.assignedMemberNames.join(', ')}`
              : 'No active strategic target yet'}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {unit.bestCandidates.slice(0, candidateLimit).map((candidate) => (
            <TargetCandidateRow
              key={`${unit.unitBaseId}-${candidate.guildMemberId}`}
              candidate={candidate}
              unitBaseId={unit.unitBaseId}
              unitName={unit.unitName}
              canManageTargets={canManageTargets}
              fixtureMode={fixtureMode}
              busyActionKey={busyActionKey}
              onAssignTarget={onAssignTarget}
            />
          ))}
          {unit.bestCandidates.length === 0 && (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-300">
              No candidate suggestions are available for this unit yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StrategicTargetCard({
  assignment,
  canManageTargets,
  fixtureMode,
  busyActionKey,
  onRemoveTarget,
}: {
  assignment: StrategicTargetAssignment;
  canManageTargets: boolean;
  fixtureMode: boolean;
  busyActionKey: string | null;
  onRemoveTarget: (assignmentId: string, memberName: string, unitName: string) => Promise<void>;
}) {
  const actionKey = `remove:${assignment.id}`;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">
              {assignment.memberName}
              {' -> '}
              {assignment.unitName}
            </p>
            <TargetStateBadge state={assignment.currentState} />
          </div>
          <p className="mt-2 text-sm text-gray-400">{assignment.whyItMatters}</p>
        </div>

        {canManageTargets && !fixtureMode && (
          <button
            onClick={() =>
              void onRemoveTarget(assignment.id, assignment.memberName, assignment.unitName)
            }
            disabled={busyActionKey === actionKey}
            className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-100 transition-colors hover:border-gray-600 hover:bg-gray-800 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-900/60 disabled:text-gray-500"
          >
            {busyActionKey === actionKey ? 'Removing...' : 'Remove'}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
          {formatAssignmentProgress(assignment)}
        </span>
        <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
          {assignment.existingStrategicTargetCount} active target
          {assignment.existingStrategicTargetCount === 1 ? '' : 's'}
        </span>
        <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
          {formatAssignmentCapacity(assignment)}
        </span>
        {assignment.planetCategory && (
          <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-blue-200">
            {assignment.planetCategory}
          </span>
        )}
        {assignment.zoneHighlights.length > 0 && (
          <span className="rounded-full border border-amber-900 bg-amber-950/40 px-3 py-1 text-amber-200">
            {assignment.zoneHighlights.join(', ')}
          </span>
        )}
        {assignment.note && (
          <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-blue-200">
            {assignment.note}
          </span>
        )}
      </div>
    </div>
  );
}

function TargetStateBadge({
  state,
}: {
  state: StrategicTargetCandidate['state'] | StrategicTargetAssignment['currentState'];
}) {
  const toneClasses = {
    ready: 'border-emerald-900 bg-emerald-950/50 text-emerald-200',
    near_miss: 'border-amber-900 bg-amber-950/50 text-amber-200',
    owned_shortfall: 'border-blue-900 bg-blue-950/50 text-blue-200',
    missing: 'border-red-900 bg-red-950/50 text-red-200',
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs ${toneClasses[state]}`}>
      {formatTargetStateLabel(state)}
    </span>
  );
}

function formatCandidateProgress(candidate: StrategicTargetCandidate, unitName: string) {
  if (!candidate.meetsOwnership) {
    return `${unitName} is not owned yet.`;
  }

  return `${candidate.currentRarity ?? 0}* / R${candidate.currentRelicTier ?? 0}, missing ${formatRequirementGap(candidate.missingRelicTiers, candidate.missingRarity)}.`;
}

function formatAssignmentProgress(assignment: StrategicTargetAssignment) {
  if (!assignment.meetsOwnership) {
    return `${assignment.unitName} not owned yet`;
  }

  return `${assignment.currentRarity ?? 0}* / R${assignment.currentRelicTier ?? 0}, missing ${formatRequirementGap(assignment.missingRelicTiers, assignment.missingRarity)}`;
}

function formatTargetStateLabel(
  state: StrategicTargetCandidate['state'] | StrategicTargetAssignment['currentState']
) {
  switch (state) {
    case 'ready':
      return 'Ready';
    case 'near_miss':
      return 'Near miss';
    case 'owned_shortfall':
      return 'Long build';
    default:
      return 'Missing';
  }
}

function formatRequirementGap(missingRelicTiers: number, missingRarity: number) {
  const parts: string[] = [];

  if (missingRelicTiers > 0) {
    parts.push(`${missingRelicTiers} relic tier${missingRelicTiers === 1 ? '' : 's'}`);
  }

  if (missingRarity > 0) {
    parts.push(`${missingRarity} star${missingRarity === 1 ? '' : 's'}`);
  }

  return parts.length > 0 ? parts.join(' and ') : 'no remaining upgrades';
}

function formatConstraintLabel(constraint: StrategicUnitImpact['primaryConstraint']) {
  switch (constraint) {
    case 'near_miss':
      return 'Upgrade target';
    case 'ownership_shortage':
      return 'Copy shortage';
    case 'hard_missing':
      return 'Hard missing';
    default:
      return 'Mixed pressure';
  }
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/70 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function ZoneReadinessCard({ zone }: { zone: StrategicZoneReadiness }) {
  const toneClasses = {
    ready: 'border-emerald-900 bg-emerald-950/20',
    partial: 'border-amber-900 bg-amber-950/20',
    blocked: 'border-red-900 bg-red-950/20',
  };

  return (
    <div className={`rounded-2xl border p-5 ${toneClasses[zone.status]}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            Phase {zone.phase}
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">{zone.zoneName}</h3>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm ${
            zone.status === 'ready'
              ? 'border-emerald-900 bg-emerald-950/50 text-emerald-200'
              : zone.status === 'partial'
                ? 'border-amber-900 bg-amber-950/50 text-amber-200'
                : 'border-red-900 bg-red-950/50 text-red-200'
          }`}
        >
          {zone.status === 'ready'
            ? 'Ready'
            : zone.status === 'partial'
              ? 'Partially blocked'
              : 'Blocked'}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <StatChip label="Slots" value={`${zone.coverableSlots}/${zone.totalSlots}`} />
        <StatChip
          label="Platoons"
          value={`${zone.estimatedCoverablePlatoons}/${zone.totalPlatoons}`}
        />
        <StatChip label="Missing" value={`${zone.missingSlots}`} />
        <StatChip label="Hard blockers" value={`${zone.hardBlockedSlots}`} />
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-gray-900">
        <div
          className="h-full bg-blue-400"
          style={{ width: `${zone.coveragePercent}%` }}
        />
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-white">Top blocking units</p>
        <div className="mt-3 space-y-3">
          {zone.blockers.slice(0, 3).map((blocker) => (
            <div
              key={`${zone.zoneKey}-${blocker.unitBaseId}`}
              className="rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{blocker.unitName}</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Missing {blocker.missingSlots} of {blocker.totalRequiredSlots} slots
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-gray-300">
                    Cover {blocker.coverableSlots}/{blocker.totalRequiredSlots}
                  </span>
                  <span className="rounded-full border border-amber-900 bg-amber-950/50 px-3 py-1 text-amber-200">
                    Near misses {blocker.nearMissOwners}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {zone.blockers.length === 0 && (
            <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
              No strategic blockers detected in this zone.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
