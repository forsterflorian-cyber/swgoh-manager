import type {
  PlatoonSimulatorAction,
  PlatoonSimulatorDelta,
  PlatoonSimulatorResponse,
  PlatoonSimulatorStepEffect,
} from '@/lib/types/platoon-simulator';
import type {
  PlatoonMatchingCoverage,
  PlatoonMatchingResult,
} from '@/lib/types/platoon-readiness';

// TODO: diese Imports an dein Projekt anpassen
import { computePlatoonMatching } from '@/lib/services/platoon-matching';

type StrategicPlannerData = any;

function readCoverageCoveredSlots(item: PlatoonMatchingCoverage): number {
  const candidate = item as unknown as Record<string, unknown>;

  const possibleKeys = [
    'coveredSlots',
    'assignedSlots',
    'filledSlots',
    'matchedSlots',
    'countCovered',
    'countAssigned',
  ];

  for (const key of possibleKeys) {
    const value = candidate[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function readCoverageTotalSlots(item: PlatoonMatchingCoverage): number {
  const candidate = item as unknown as Record<string, unknown>;

  const possibleKeys = [
    'totalSlots',
    'requiredSlots',
    'slotCount',
    'total',
    'countTotal',
  ];

  for (const key of possibleKeys) {
    const value = candidate[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function readCoveragePlatoonId(item: PlatoonMatchingCoverage): string | null {
  const candidate = item as unknown as Record<string, unknown>;

  const possibleKeys = [
    'platoonId',
    'targetPlatoonId',
    'id',
    'key',
  ];

  for (const key of possibleKeys) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function countCoveredSlots(result: PlatoonMatchingResult): number {
  return result.coverage.reduce(
    (sum, item) => sum + readCoverageCoveredSlots(item),
    0,
  );
}

function countFullPlatoons(result: PlatoonMatchingResult): number {
  return result.coverage.filter((item) => {
    const covered = readCoverageCoveredSlots(item);
    const total = readCoverageTotalSlots(item);
    return total > 0 && covered >= total;
  }).length;
}

function getFullPlatoonIds(result: PlatoonMatchingResult): string[] {
  return result.coverage
    .filter((item) => {
      const covered = readCoverageCoveredSlots(item);
      const total = readCoverageTotalSlots(item);
      return total > 0 && covered >= total;
    })
    .map((item) => readCoveragePlatoonId(item))
    .filter((value): value is string => !!value);
}

function getAssignmentKeys(result: PlatoonMatchingResult): Set<string> {
  return new Set(
    result.assignments.map((item) => {
      const candidate = item as unknown as Record<string, unknown>;

      const platoonId =
        typeof candidate.platoonId === 'string' ? candidate.platoonId : 'unknown-platoon';
      const slotId =
        typeof candidate.slotId === 'string' ? candidate.slotId : 'unknown-slot';
      const ownerKey =
        typeof candidate.ownerKey === 'string' ? candidate.ownerKey : 'unknown-owner';

      return `${platoonId}::${slotId}::${ownerKey}`;
    }),
  );
}

function buildDelta(
  baseline: PlatoonMatchingResult,
  simulated: PlatoonMatchingResult,
): PlatoonSimulatorDelta {
  const baselineCoveredSlots = countCoveredSlots(baseline);
  const simulatedCoveredSlots = countCoveredSlots(simulated);

  const baselineFullPlatoons = countFullPlatoons(baseline);
  const simulatedFullPlatoons = countFullPlatoons(simulated);

  const baselineFullIds = new Set(getFullPlatoonIds(baseline));
  const simulatedFullIds = new Set(getFullPlatoonIds(simulated));

  const becameFullPlatoonIds = [...simulatedFullIds].filter(
    (id) => !baselineFullIds.has(id),
  );

  const noLongerFullPlatoonIds = [...baselineFullIds].filter(
    (id) => !simulatedFullIds.has(id),
  );

  const baselineAssignments = getAssignmentKeys(baseline);
  const simulatedAssignments = getAssignmentKeys(simulated);

  const changedAssignmentCount =
    [...baselineAssignments].filter((key) => !simulatedAssignments.has(key)).length +
    [...simulatedAssignments].filter((key) => !baselineAssignments.has(key)).length;

  const displacedAssignmentCount = [...baselineAssignments].filter(
    (key) => !simulatedAssignments.has(key),
  ).length;

  return {
    baselineCoveredSlots,
    simulatedCoveredSlots,
    deltaCoveredSlots: simulatedCoveredSlots - baselineCoveredSlots,

    baselineFullPlatoons,
    simulatedFullPlatoons,
    deltaFullPlatoons: simulatedFullPlatoons - baselineFullPlatoons,

    changedAssignmentCount,
    displacedAssignmentCount,

    becameFullPlatoonIds,
    noLongerFullPlatoonIds,
  };
}

/**
 * WICHTIG:
 * Diese Funktion verändert NICHT das Matching direkt.
 * Sie verändert nur hypothetisch den Eingabedatensatz.
 *
 * Die TODO-Stellen musst du an deine echte Datenstruktur anpassen.
 */
export function applySimulationActions(
  dataset: StrategicPlannerData,
  actions: PlatoonSimulatorAction[],
): StrategicPlannerData {
  const cloned: StrategicPlannerData = structuredClone(dataset);

  for (const action of actions) {
    if (action.type === 'MAKE_SLOT_ELIGIBLE') {
      // TODO: an echte Datenstruktur anpassen
    }

    if (action.type === 'REMOVE_SOURCE_BLOCK') {
      // TODO: an echte Datenstruktur anpassen
    }
  }

  return cloned;
}

function simulateStepEffects(
  dataset: StrategicPlannerData,
  actions: PlatoonSimulatorAction[],
): PlatoonSimulatorStepEffect[] {
  const steps: PlatoonSimulatorStepEffect[] = [];

  let currentDataset: StrategicPlannerData = structuredClone(dataset);
  let currentMatching = computePlatoonMatching(currentDataset);

  for (const action of actions) {
    const coveredSlotsBefore = countCoveredSlots(currentMatching);
    const fullPlatoonsBefore = countFullPlatoons(currentMatching);

    currentDataset = applySimulationActions(currentDataset, [action]);
    const nextMatching = computePlatoonMatching(currentDataset);

    const coveredSlotsAfter = countCoveredSlots(nextMatching);
    const fullPlatoonsAfter = countFullPlatoons(nextMatching);

    const becameFullPlatoonIds = buildDelta(
      currentMatching,
      nextMatching,
    ).becameFullPlatoonIds;

    steps.push({
      actionId: action.id,
      coveredSlotsBefore,
      coveredSlotsAfter,
      fullPlatoonsBefore,
      fullPlatoonsAfter,
      becameFullPlatoonIds,
    });

    currentMatching = nextMatching;
  }

  return steps;
}

export function simulatePlatoonScenario(
  dataset: StrategicPlannerData,
  actions: PlatoonSimulatorAction[],
): PlatoonSimulatorResponse {
  const baseline = computePlatoonMatching(dataset);

  const simulatedDataset = applySimulationActions(dataset, actions);
  const simulated = computePlatoonMatching(simulatedDataset);

  const delta = buildDelta(baseline, simulated);
  const steps = simulateStepEffects(dataset, actions);

  return {
    baseline,
    simulated,
    delta,
    steps,
  };
}