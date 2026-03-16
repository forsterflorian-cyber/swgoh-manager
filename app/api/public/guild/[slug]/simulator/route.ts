import { NextResponse } from 'next/server';
import { simulatePlatoonScenario } from '@/lib/services/platoon-simulator';
import { findSequentialFullPlatoonPlan } from '@/lib/services/platoon-completion-advisor';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import type { StrategicPlannerDataset } from '@/lib/types/platoon-readiness';
import type { PlatoonSimulatorAction } from '@/lib/types/platoon-simulator';

type RouteParams = {
  slug: string;
};

type RouteContext = {
  params: Promise<RouteParams>;
};

type PlannerMode = 'manual' | 'auto';

function parseActions(body: unknown): PlatoonSimulatorAction[] {
  if (!body || typeof body !== 'object') {
    return [];
  }

  const candidate = (body as { actions?: unknown }).actions;
  return Array.isArray(candidate) ? (candidate as PlatoonSimulatorAction[]) : [];
}

function parseIncludeBonusZones(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  return Boolean((body as { includeBonusZones?: unknown }).includeBonusZones);
}

function parseMode(body: unknown): PlannerMode {
  if (!body || typeof body !== 'object') {
    return 'manual';
  }

  const mode = (body as { mode?: unknown }).mode;
  return mode === 'auto' ? 'auto' : 'manual';
}

function filterDatasetByBonusZoneSetting(
  dataset: StrategicPlannerDataset,
  includeBonusZones: boolean,
): StrategicPlannerDataset {
  if (includeBonusZones) {
    return dataset;
  }

  return {
    ...dataset,
    slots: dataset.slots.filter((slot) => slot.planetCategory !== 'SPECIAL'),
  };
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
    const includeBonusZones = parseIncludeBonusZones(body);
    const mode = parseMode(body);

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

    const effectiveDataset = filterDatasetByBonusZoneSetting(dataset, includeBonusZones);

    const simulationStartedAt = Date.now();
    const simulation = await withStageTimeout(
      'simulation',
      () => simulatePlatoonScenario(effectiveDataset, actions),
      120000,
    );
    timings.simulation_ms = Date.now() - simulationStartedAt;

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

    const platoonLabels: Record<string, string> = {};
    for (const slot of effectiveDataset.slots) {
      const platoonId = `${String(slot.phase)}::${slot.zoneKey}::${slot.platoonKey}`;

      if (!platoonLabels[platoonId]) {
        platoonLabels[platoonId] = `Phase ${slot.phase} · ${slot.zoneName} · Platoon ${slot.platoonNumber}`;
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
          platoonLabels,
        },
        settings: {
          includeBonusZones,
          mode,
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