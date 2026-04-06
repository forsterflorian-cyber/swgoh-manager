'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Navbar } from '@/components/layout/Navbar';
import { WorkingOverlay } from '@/components/ui/WorkingOverlay';
import { formatDateTime } from '@/lib/utils/format-date';
import type { ApiEnvelope } from '@/lib/types/api';
import type {
  PlanetCategory,
  StrategicPlannerData,
} from '@/lib/types/platoon-readiness';

import {
  Banner,
  HeaderPill,
  PlannerLoadingShell,
  PlannerViewNavigation,
  groupZonesByPhase,
} from './_components/PlannerViews';
import { MatchingView } from './_components/views/MatchingView';
import { MemberTargetsView } from './_components/views/MemberTargetsView';
import { OverviewView } from './_components/views/OverviewView';
import { PrioritiesView } from './_components/views/PrioritiesView';
import {
  buildPlannerViewHref,
  type PlannerViewKey,
  type SelectedCoverageCell,
} from './_lib/planner-types';

type Notice = {
  tone: 'success' | 'error';
  message: string;
};

type PlatoonPlannerClientProps = {
  fixture: string | null;
  initialView: PlannerViewKey;
  initialData: StrategicPlannerData | null;
  initialError: string | null;
};

export default function PlatoonPlannerClient({
  fixture,
  initialView,
  initialData,
  initialError,
}: PlatoonPlannerClientProps) {
  const [selectedCoverageCell, setSelectedCoverageCell] = useState<SelectedCoverageCell>(null);
  const plannerView = initialView;
  const [data, setData] = useState<StrategicPlannerData | null>(initialData);
  const [loading, setLoading] = useState(initialData === null && initialError === null);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const navbar = <Navbar />;

  useEffect(() => {
    setData(initialData);
    setError(initialError);
    setLoading(initialData === null && initialError === null);
    setReloading(false);
    setNotice(null);
    setSelectedCoverageCell(null);
  }, [fixture, initialData, initialError, initialView]);

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
