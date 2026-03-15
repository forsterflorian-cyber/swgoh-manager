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

export async function POST(request: Request, { params }: RouteContext) {
  const startedAt = Date.now();

  try {
    const { slug } = await params;
    const body = await request.json();
    const actions = parseActions(body);

    const afterBodyAt = Date.now();

    const dataset = await loadStrategicPlannerDatasetForGuildSlug(slug);

    const afterLoadAt = Date.now();

    if (!dataset) {
      return NextResponse.json(
        {
          error: 'Guild dataset not found.',
          stage: 'load_dataset',
          timings: {
            totalMs: Date.now() - startedAt,
            parseBodyMs: afterBodyAt - startedAt,
            loadDatasetMs: afterLoadAt - afterBodyAt,
          },
        },
        { status: 404 },
      );
    }

    const simulation = simulatePlatoonScenario(dataset, actions);

    const afterSimulationAt = Date.now();

    return NextResponse.json(
      {
        ok: true,
        stage: 'simulation_done',
        timings: {
          totalMs: Date.now() - startedAt,
          parseBodyMs: afterBodyAt - startedAt,
          loadDatasetMs: afterLoadAt - afterBodyAt,
          simulationMs: afterSimulationAt - afterLoadAt,
        },
        simulation,
        advisory: {
          first: null,
          second: null,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Simulator API error', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed during simulation.',
        stage: 'simulation',
        timings: {
          totalMs: Date.now() - startedAt,
        },
      },
      { status: 500 },
    );
  }
}