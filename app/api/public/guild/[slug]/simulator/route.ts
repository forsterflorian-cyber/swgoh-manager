import { NextResponse } from 'next/server';
import { simulatePlatoonScenario } from '@/lib/services/platoon-simulator';
import {
  findSequentialFullPlatoonPlan,
  type AutoModeTarget,
} from '@/lib/services/platoon-completion-advisor';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import type { StrategicPlannerDataset, PlanetCategory } from '@/lib/types/platoon-readiness';
import type { PlatoonSimulatorAction } from '@/lib/types/platoon-simulator';

type RouteParams = {
  slug: string;
};

type RouteContext = {
  params: Promise<RouteParams>;
};

type PlannerMode = 'manual' | 'auto';

type BonusZoneOption = {
  zoneKey: string;
  label: string;
};

type AutoTargetOption = {
  phase: number;
  category: PlanetCategory;
  label: string;
  assignedCount: number;
  requirementCount: number;
  coveragePercent: number;
};

type ExportAssignment = {
  requirementId: string;
  phase: number | string;
  zoneKey: string;
  platoonKey: string;
  slotNumber: number | string;
  unitBaseId: string;
  unitName: string;
  planetCategory: string | null;
  memberId: string;
  playerName: string;
  platoonLabel: string;
};

function parseActions(body: unknown): PlatoonSimulatorAction[] {
  if (!body || typeof body !== 'object') {
    return [];
  }

  const candidate = (body as { actions?: unknown }).actions;
  return Array.isArray(candidate) ? (candidate as PlatoonSimulatorAction[]) : [];
}

function parseMode(body: unknown): PlannerMode {
  if (!body || typeof body !== 'object') {
    return 'manual';
  }

  const mode = (body as { mode?: unknown }).mode;
  return mode === 'auto' ? 'auto' : 'manual';
}

function parseIncludedBonusZoneKeys(body: unknown): string[] {
  if (!body || typeof body !== 'object') {
    return [];
  }

  const candidate = (body as { includedBonusZoneKeys?: unknown }).includedBonusZoneKeys;
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function parseAutoTarget(body: unknown): AutoModeTarget {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const raw = (body as { autoTarget?: unknown }).autoTarget;
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (record.kind !== 'phase-category') {
    return null;
  }

  const phase = typeof record.phase === 'number' ? record.phase : Number(record.phase);
  const category = typeof record.category === 'string' ? (record.category as PlanetCategory) : null;

  if (!Number.isFinite(phase) || !category) {
    return null;
  }

  return {
    kind: 'phase-category',
    phase,
    category,
  };
}

function filterDatasetBySelectedBonusZones(
  dataset: StrategicPlannerDataset,
  includedBonusZoneKeys: string[],
): StrategicPlannerDataset {
  const included = new Set(includedBonusZoneKeys);

  return {
    ...dataset,
    slots: dataset.slots.filter((slot) => {
      if (slot.planetCategory !== 'SPECIAL') {
        return true;
      }

      return included.has(slot.zoneKey);
    }),
  };
}

function collectBonusZoneOptions(dataset: StrategicPlannerDataset): BonusZoneOption[] {
  const byZone = new Map<string, BonusZoneOption>();

  for (const slot of dataset.slots) {
    if (slot.planetCategory !== 'SPECIAL') {
      continue;
    }

    if (!byZone.has(slot.zoneKey)) {
      byZone.set(slot.zoneKey, {
        zoneKey: slot.zoneKey,
        label: `Phase ${slot.phase} · ${slot.zoneName}`,
      });
    }
  }

  return [...byZone.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function collectAutoTargetOptions(
  dataset: StrategicPlannerDataset,
  matching: {
    coverage: Array<{
      phase: number;
      category: PlanetCategory;
      assignedCount: number;
      requirementCount: number;
      coveragePercent: number;
      isBonus?: boolean;
    }>;
  },
): AutoTargetOption[] {
  return matching.coverage
    .filter((entry) => !entry.isBonus && entry.requirementCount > 0 && entry.assignedCount < entry.requirementCount)
    .map((entry) => ({
      phase: entry.phase,
      category: entry.category,
      label: `Phase ${entry.phase} · ${entry.category} · ${entry.coveragePercent}% · ${entry.assignedCount}/${entry.requirementCount}`,
      assignedCount: entry.assignedCount,
      requirementCount: entry.requirementCount,
      coveragePercent: entry.coveragePercent,
    }))
    .sort((a, b) => {
      if (a.phase !== b.phase) {
        return a.phase - b.phase;
      }

      if (a.coveragePercent !== b.coveragePercent) {
        return a.coveragePercent - b.coveragePercent;
      }

      return a.category.localeCompare(b.category);
    });
}

function buildPlatoonLabels(dataset: StrategicPlannerDataset): Record<string, string> {
  const platoonLabels: Record<string, string> = {};

  for (const slot of dataset.slots) {
    const platoonId = `${String(slot.phase)}::${slot.zoneKey}::${slot.platoonKey}`;

    if (!platoonLabels[platoonId]) {
      platoonLabels[platoonId] = `Phase ${slot.phase} · ${slot.zoneName} · Platoon ${slot.platoonNumber}`;
    }
  }

  return platoonLabels;
}

function buildExportAssignments(
  simulatedAssignments: unknown,
  platoonLabels: Record<string, string>,
): ExportAssignment[] {
  if (!Array.isArray(simulatedAssignments)) {
    return [];
  }

  return simulatedAssignments
    .map((assignment) => {
      const a = assignment as Record<string, unknown>;

      const phase =
        typeof a.phase === 'number' || typeof a.phase === 'string'
          ? a.phase
          : '';

      const zoneKey = typeof a.zoneKey === 'string' ? a.zoneKey : '';
      const platoonKey = typeof a.platoonKey === 'string' ? a.platoonKey : '';
      const requirementId = typeof a.requirementId === 'string' ? a.requirementId : '';
      const unitBaseId = typeof a.unitBaseId === 'string' ? a.unitBaseId : '';
      const unitName = typeof a.unitName === 'string' ? a.unitName : unitBaseId;
      const memberId = typeof a.memberId === 'string' ? a.memberId : '';
      const playerName = typeof a.playerName === 'string' ? a.playerName : memberId;
      const slotNumber =
        typeof a.slotNumber === 'number' || typeof a.slotNumber === 'string'
          ? a.slotNumber
          : '';
      const planetCategory =
        typeof a.planetCategory === 'string' ? a.planetCategory : null;

      const platoonId = `${String(phase)}::${zoneKey}::${platoonKey}`;
      const platoonLabel = platoonLabels[platoonId] ?? platoonId;

      return {
        requirementId,
        phase,
        zoneKey,
        platoonKey,
        slotNumber,
        unitBaseId,
        unitName,
        planetCategory,
        memberId,
        playerName,
        platoonLabel,
      };
    })
    .filter(
      (item) =>
        item.requirementId &&
        item.zoneKey &&
        item.platoonKey &&
        item.memberId &&
        item.unitBaseId,
    )
    .sort((a, b) => {
      if (String(a.phase) !== String(b.phase)) {
        return String(a.phase).localeCompare(String(b.phase), undefined, { numeric: true });
      }

      if (a.zoneKey !== b.zoneKey) {
        return a.zoneKey.localeCompare(b.zoneKey);
      }

      if (a.platoonKey !== b.platoonKey) {
        return a.platoonKey.localeCompare(b.platoonKey);
      }

      return String(a.slotNumber).localeCompare(String(b.slotNumber), undefined, { numeric: true });
    });
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
    const includedBonusZoneKeys = parseIncludedBonusZoneKeys(body);
    const mode = parseMode(body);
    const autoTarget = parseAutoTarget(body);

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

    const bonusZoneOptions = collectBonusZoneOptions(dataset);
    const effectiveDataset = filterDatasetBySelectedBonusZones(dataset, includedBonusZoneKeys);

    const simulationStartedAt = Date.now();
    const simulation = await withStageTimeout(
      'simulation',
      () => simulatePlatoonScenario(effectiveDataset, actions),
      120000,
    );
    timings.simulation_ms = Date.now() - simulationStartedAt;

    const autoTargetOptions = collectAutoTargetOptions(
      simulation.simulatedDataset,
      simulation.simulated as unknown as {
        coverage: Array<{
          phase: number;
          category: PlanetCategory;
          assignedCount: number;
          requirementCount: number;
          coveragePercent: number;
          isBonus?: boolean;
        }>;
      },
    );

    const advisoryStartedAt = Date.now();
    const advisory = await withStageTimeout(
      'advisor',
      () =>
        findSequentialFullPlatoonPlan(
          simulation.simulatedDataset,
          simulation.simulated,
          mode === 'auto' ? autoTarget : null,
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

    const platoonLabels = buildPlatoonLabels(effectiveDataset);
    const fullNewAssignments = buildExportAssignments(
      (simulation.simulated as unknown as { assignments?: unknown[] }).assignments,
      platoonLabels,
    );

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
          includedBonusZoneKeys,
          mode,
          autoTarget,
        },
        bonusZoneOptions,
        autoTargetOptions,
        fullNewAssignments,
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