'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Navbar } from '@/components/layout/Navbar';
import type {
  PlanetCategory,
  StrategicMemberAssignmentLoad,
  StrategicPlannerData,
  StrategicPlannerSummary,
  StrategicTargetAssignment,
  StrategicTargetCandidate,
  StrategicUnitImpact,
  StrategicZoneReadiness,
} from '@/lib/types/platoon-readiness';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type Notice = {
  tone: 'success' | 'error';
  message: string;
};

type PlannerViewKey = 'overview' | 'priorities' | 'targets';

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
];

function isPlannerViewKey(value: string | null): value is PlannerViewKey {
  return value === 'overview' || value === 'priorities' || value === 'targets';
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
  const searchParams = useSearchParams();
  const fixture = searchParams.get('fixture');
  const requestedView = searchParams.get('view');
  const plannerView = isPlannerViewKey(requestedView) ? requestedView : 'overview';
  const [data, setData] = useState<StrategicPlannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const navbar = (
    <Navbar
      guildName={data?.guild?.name ?? null}
      guildSlug={data?.guild?.slug ?? null}
      canManageGuild={data?.permissions.canManageTargets ?? false}
    />
  );

  const loadPlanner = useCallback(
    async (showLoadingState = true) => {
      if (showLoadingState) {
        setLoading(true);
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
          guildId: planner.guild.id,
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
      <div className="mx-auto max-w-7xl px-4 py-10">
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
            canManageTargets={canManageTargets}
            fixtureMode={fixtureMode}
            busyActionKey={busyActionKey}
            onAssignTarget={handleAssignTarget}
            targetsHref={targetsHref}
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

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
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

function PrioritiesView({
  summary,
  topMissingUnits,
  groupedZones,
  canManageTargets,
  fixtureMode,
  busyActionKey,
  onAssignTarget,
  targetsHref,
}: {
  summary: StrategicPlannerSummary | null;
  topMissingUnits: StrategicUnitImpact[];
  groupedZones: Array<[number, StrategicZoneReadiness[]]>;
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

      {summary && (
        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Bottleneck units"
            value={`${summary.bottleneckUnitCount}`}
            detail="Distinct units currently constraining platoon readiness"
            tone={summary.bottleneckUnitCount > 0 ? 'warning' : 'positive'}
          />
          <MetricCard
            title="Missing slots"
            value={`${summary.missingSlots}`}
            detail="Blocked demand still unresolved across the imported reference"
            tone={summary.missingSlots > 0 ? 'danger' : 'positive'}
          />
          <MetricCard
            title="Blocked platoons"
            value={`${summary.blockedPlatoons}`}
            detail="Platoons still short of required guild inventory"
            tone={summary.blockedPlatoons > 0 ? 'warning' : 'positive'}
          />
          <MetricCard
            title="Blocked zones"
            value={`${summary.blockedZones}`}
            detail="Zones under structural pressure from missing units"
            tone={summary.blockedZones > 0 ? 'warning' : 'positive'}
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
              Full bottleneck ranking
            </h3>
          </div>
          <p className="max-w-2xl text-sm text-gray-400">
            Impact blends blocked demand, limiting zones and platoons, shortage depth, and upgrade
            leverage. Candidate suggestions stay secondary to the unit analysis.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {topMissingUnits.length > 0 ? (
            topMissingUnits.map((unit, index) => (
              <MissingUnitCard
                key={unit.unitBaseId}
                unit={unit}
                rank={index + 1}
                candidateLimit={3}
                canManageTargets={canManageTargets}
                fixtureMode={fixtureMode}
                busyActionKey={busyActionKey}
                onAssignTarget={onAssignTarget}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-5 text-sm text-emerald-100">
              Current roster data covers every imported platoon slot.
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
          {groupedZones.length > 0 ? (
            groupedZones.map(([phase, zones]) => (
              <div key={phase}>
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-xl font-semibold text-white">Phase {phase}</h4>
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
              Zone pressure will appear here once the planner has enough readiness data.
            </div>
          )}
        </div>
      </section>
    </section>
  );
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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

function MissingUnitCard({
  unit,
  rank,
  candidateLimit = 4,
  canManageTargets,
  fixtureMode,
  busyActionKey,
  onAssignTarget,
}: {
  unit: StrategicUnitImpact;
  rank: number;
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
            </div>
            <p className="mt-2 text-sm text-gray-400">{unit.reasonSummary}</p>
          </div>
        </div>
        <span className="rounded-full border border-red-900 bg-red-950/50 px-3 py-1 text-sm text-red-200">
          Impact {unit.impactScore}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <StatChip label="Blocked slots" value={`${unit.blockedSlots}`} />
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
        Shortage depth {shortagePercent}%. Strictest requirement: R
        {unit.strictestRequirement.minRelic} and {unit.strictestRequirement.minRarity} stars. Near
        miss pressure affects {unit.nearMissSlots} blocked slot
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
