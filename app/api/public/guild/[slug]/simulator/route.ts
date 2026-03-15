import { NextResponse } from 'next/server';
import { simulatePlatoonScenario } from '@/lib/services/platoon-simulator';
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

async function withStageTimeout<T>(
  stage: string,
  fn: () => T | Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return await Promise.race([
    Promise.resolve().then(fn),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`TIMEOUT_AT_STAGE:${stage}`));
      }, timeoutMs);
    }),
  ]);
}

export async function POST(request: Request, { params }: RouteContext) {
  const timings: Record<string, number> = {};
  const startedAt = Date.now();

  try {
    const { slug } = await params;
    const body = await request.json();
    const actions = parseActions(body);

    console.log('[route] actionsCount', actions.length);
    console.log('[route] firstAction', actions[0] ?? null);

    const loadStartedAt = Date.now();
    const dataset = await withStageTimeout(
      'load_dataset',
      () => loadStrategicPlannerDatasetForGuildSlug(slug),
      120000,
    );
    timings.load_dataset_ms = Date.now() - loadStartedAt;

    if (!dataset.guild || !dataset.reference) {
      return NextResponse.json(
        { error: 'Guild dataset not found.', timings },
        { status: 404 },
      );
    }

    const simulationStartedAt = Date.now();
    const simulation = await withStageTimeout(
      'simulation',
      () => simulatePlatoonScenario(dataset, actions),
      120000,
    );
    timings.simulation_ms = Date.now() - simulationStartedAt;

    console.log('[route] delta', simulation.delta);

    const advisoryStartedAt = Date.now();
    const advisory = await withStageTimeout(
      'advisor',
      () =>
        findSequentialFullPlatoonPlan(
          simulation.simulatedDataset,
          simulation.simulated,
        ),
      120000,
    );
    timings.advisor_ms = Date.now() - advisoryStartedAt;

    console.log('[route] advisory', advisory);

    timings.total_ms = Date.now() - startedAt;

    const memberNames: Record<string, string> = {};
    for (const m of dataset.members) {
      memberNames[m.memberId] = m.playerName;
    }

    const unitNames: Record<string, string> = {};
    for (const s of dataset.slots) {
      if (s.unitName) unitNames[s.unitBaseId] = s.unitName;
    }
    for (const r of dataset.roster) {
      if (r.unitName && !unitNames[r.unitBaseId]) {
        unitNames[r.unitBaseId] = r.unitName;
      }
    }

    return NextResponse.json(
      {
        simulation: {
          delta: simulation.delta,
        },
        advisory,
        lookups: {
          memberNames,
          unitNames,
        },
        debug: {
          actionsCount: actions.length,
          timings,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to simulate scenario.';

    const timeoutPrefix = 'TIMEOUT_AT_STAGE:';
    if (message.startsWith(timeoutPrefix)) {
      return NextResponse.json(
        {
          error: message,
          stage: message.slice(timeoutPrefix.length),
          timings: {
            ...timings,
            total_ms: Date.now() - startedAt,
          },
        },
        { status: 500 },
      );
    }

    console.error('Simulator API error', error);

    return NextResponse.json(
      {
        error: message,
        timings: {
          ...timings,
          total_ms: Date.now() - startedAt,
        },
      },
      { status: 500 },
    );
  }
}