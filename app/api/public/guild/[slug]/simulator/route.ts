import { NextResponse } from 'next/server';
import {
  applySimulationActions,
  simulatePlatoonScenario,
} from '@/lib/services/platoon-simulator';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
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
  timeoutMs = 5000,
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

    const dataset = await withStageTimeout('load_dataset', () =>
      loadStrategicPlannerDatasetForGuildSlug(slug),
    );
    timings.load_dataset_ms = Date.now() - startedAt;

    if (!dataset.guild || !dataset.reference) {
      return NextResponse.json(
        { error: 'Guild dataset not found.', timings },
        { status: 404 },
      );
    }

    const baselineStartedAt = Date.now();
    const baseline = await withStageTimeout('baseline_matching', () =>
      computePlatoonMatching(dataset),
    );
    timings.baseline_matching_ms = Date.now() - baselineStartedAt;

    const applyStartedAt = Date.now();
    const simulatedDataset = await withStageTimeout('apply_actions', () =>
      applySimulationActions(dataset, actions),
    );
    timings.apply_actions_ms = Date.now() - applyStartedAt;

    const simulatedStartedAt = Date.now();
    const simulated = await withStageTimeout('simulated_matching', () =>
      computePlatoonMatching(simulatedDataset),
    );
    timings.simulated_matching_ms = Date.now() - simulatedStartedAt;

    const deltaStartedAt = Date.now();
    const simulation = await withStageTimeout('build_simulation', () =>
      simulatePlatoonScenario(dataset, actions),
    );
    timings.build_simulation_ms = Date.now() - deltaStartedAt;

    const advisoryStartedAt = Date.now();
    const advisory = await withStageTimeout('advisor', () =>
      findSequentialFullPlatoonPlan(simulatedDataset),
    );
    timings.advisor_ms = Date.now() - advisoryStartedAt;

    timings.total_ms = Date.now() - startedAt;

    return NextResponse.json(
      {
        simulation,
        advisory,
        debug: {
          actionsCount: actions.length,
          timings,
          baselineExists: !!baseline,
          simulatedExists: !!simulated,
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