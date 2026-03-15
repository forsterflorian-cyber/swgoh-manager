import { NextResponse } from 'next/server';
import {
  applySimulationActions,
  simulatePlatoonScenario,
} from '@/lib/services/platoon-simulator';
import { findSequentialFullPlatoonPlan } from '@/lib/services/platoon-completion-advisor';
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

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const actions = parseActions(body);

    const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

    if (!dataset.guild || !dataset.reference) {
      return NextResponse.json(
        { error: 'Guild dataset not found.' },
        { status: 404 },
      );
    }

    const simulation = simulatePlatoonScenario(dataset, actions);
    const simulatedDataset = applySimulationActions(dataset, actions);
    const advisory = findSequentialFullPlatoonPlan(simulatedDataset);

    return NextResponse.json(
      {
        simulation,
        advisory,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Simulator API error', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to simulate scenario.',
      },
      { status: 500 },
    );
  }
}