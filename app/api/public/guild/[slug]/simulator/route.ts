import { NextResponse } from 'next/server';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import type { PlatoonSimulatorAction } from '@/lib/types/platoon-simulator';

type RouteParams = {
  slug: string;
};

type RouteContext = {
  params: Promise<RouteParams>;
};

function parseActions(body: unknown): PlatoonSimulatorAction[] {
  if (!body || typeof body !== 'object') {
    return [];
  }

  const candidate = (body as { actions?: unknown }).actions;
  return Array.isArray(candidate) ? (candidate as PlatoonSimulatorAction[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function countSlotsFromRoot(root: Record<string, unknown> | null): number {
  if (!root) return 0;

  const phases = Array.isArray(root.phases) ? (root.phases as Record<string, unknown>[]) : [];
  let count = 0;

  for (const phase of phases) {
    const zones = Array.isArray(phase.zones) ? (phase.zones as Record<string, unknown>[]) : [];

    for (const zone of zones) {
      const platoons = Array.isArray(zone.platoons)
        ? (zone.platoons as Record<string, unknown>[])
        : [];

      for (const platoon of platoons) {
        const slots = Array.isArray(platoon.slots)
          ? (platoon.slots as Record<string, unknown>[])
          : [];
        count += slots.length;
      }
    }
  }

  return count;
}

function countPlatoonsFromRoot(root: Record<string, unknown> | null): number {
  if (!root) return 0;

  const phases = Array.isArray(root.phases) ? (root.phases as Record<string, unknown>[]) : [];
  let count = 0;

  for (const phase of phases) {
    const zones = Array.isArray(phase.zones) ? (phase.zones as Record<string, unknown>[]) : [];

    for (const zone of zones) {
      const platoons = Array.isArray(zone.platoons)
        ? (zone.platoons as Record<string, unknown>[])
        : [];
      count += platoons.length;
    }
  }

  return count;
}

function countMembersFromRoot(root: Record<string, unknown> | null): number {
  if (!root) return 0;

  if (Array.isArray(root.members)) {
    return root.members.length;
  }

  if (Array.isArray(root.rosterMembers)) {
    return root.rosterMembers.length;
  }

  return 0;
}

function inspectCandidate(name: string, value: unknown) {
  const root = asRecord(value);

  return {
    name,
    exists: !!root,
    topLevelKeys: root ? Object.keys(root).sort() : [],
    membersCount: countMembersFromRoot(root),
    platoonsCount: countPlatoonsFromRoot(root),
    slotsCount: countSlotsFromRoot(root),
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const actions = parseActions(body);

    const loaded = await loadStrategicPlannerDatasetForGuildSlug(slug);
    const root = asRecord(loaded);

    const datasetCandidate = root ? root.dataset : undefined;
    const plannerDataCandidate = root ? root.plannerData : undefined;
    const dataCandidate = root ? root.data : undefined;
    const readinessCandidate = root ? root.readiness : undefined;
    const strategicPlannerDatasetCandidate = root ? root.strategicPlannerDataset : undefined;

    return NextResponse.json(
      {
        simulation: {
          baseline: null,
          simulated: null,
          delta: {
            baselineCoveredSlots: 0,
            simulatedCoveredSlots: 0,
            deltaCoveredSlots: 0,
            baselineFullPlatoons: 0,
            simulatedFullPlatoons: 0,
            deltaFullPlatoons: 0,
            changedAssignmentCount: 0,
            displacedAssignmentCount: 0,
            becameFullPlatoonIds: [],
            noLongerFullPlatoonIds: [],
          },
        },
        advisory: {
          first: null,
          second: null,
        },
        debug: {
          slug,
          actionsCount: actions.length,
          root: inspectCandidate('root', loaded),
          dataset: inspectCandidate('dataset', datasetCandidate),
          plannerData: inspectCandidate('plannerData', plannerDataCandidate),
          data: inspectCandidate('data', dataCandidate),
          readiness: inspectCandidate('readiness', readinessCandidate),
          strategicPlannerDataset: inspectCandidate(
            'strategicPlannerDataset',
            strategicPlannerDatasetCandidate,
          ),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Simulator API error', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed before simulation.',
      },
      { status: 500 },
    );
  }
}