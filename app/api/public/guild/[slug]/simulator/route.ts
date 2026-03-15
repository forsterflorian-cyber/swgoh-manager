import { NextResponse } from 'next/server';
import { simulatePlatoonScenario } from '@/lib/services/platoon-simulator';
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

function countSlots(dataset: unknown): number {
  const root = dataset as Record<string, unknown> | null;
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

function countPlatoons(dataset: unknown): number {
  const root = dataset as Record<string, unknown> | null;
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

function countEligibleEntries(dataset: unknown): number {
  const root = dataset as Record<string, unknown> | null;
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

        for (const slot of slots) {
          const eligibleRoster = Array.isArray(slot.eligibleRoster)
            ? (slot.eligibleRoster as unknown[])
            : [];
          count += eligibleRoster.length;
        }
      }
    }
  }

  return count;
}

function countMembers(dataset: unknown): number {
  const root = dataset as Record<string, unknown> | null;
  if (!root) return 0;

  if (Array.isArray(root.members)) {
    return root.members.length;
  }

  if (Array.isArray(root.rosterMembers)) {
    return root.rosterMembers.length;
  }

  return 0;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const actions = parseActions(body);

    const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

    if (!dataset) {
      return NextResponse.json({ error: 'Guild dataset not found.' }, { status: 404 });
    }

    const simulation = simulatePlatoonScenario(dataset, actions);

    return NextResponse.json(
      {
        simulation,
        advisory: {
          first: null,
          second: null,
        },
        debug: {
          slug,
          actionsCount: actions.length,
          membersCount: countMembers(dataset),
          platoonsCount: countPlatoons(dataset),
          slotsCount: countSlots(dataset),
          eligibleEntriesCount: countEligibleEntries(dataset),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Simulator API error', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to simulate scenario.',
      },
      { status: 500 },
    );
  }
}