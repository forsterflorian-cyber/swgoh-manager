import type { PlanetCategory, PlatoonMatchingResult } from '@/lib/types/platoon-readiness';

export type PlatoonSimulatorAction =
  | {
      id: string;
      type: 'MAKE_SLOT_ELIGIBLE';
      slotKey: string;
      memberId: string;
      reason: 'upgrade' | 'unlock' | 'availability';
    }
  | {
      id: string;
      type: 'REMOVE_SOURCE_BLOCK';
      memberId: string;
      unitBaseId: string;
      planetCategory: PlanetCategory | null;
      blockType: 'committed' | 'reserved' | 'manual';
    };

export type PlatoonSimulatorStepEffect = {
  actionId: string;
  coveredSlotsBefore: number;
  coveredSlotsAfter: number;
  fullPlatoonsBefore: number;
  fullPlatoonsAfter: number;
  becameFullPlatoonIds: string[];
};

export type PlatoonSimulatorDelta = {
  baselineCoveredSlots: number;
  simulatedCoveredSlots: number;
  deltaCoveredSlots: number;

  baselineFullPlatoons: number;
  simulatedFullPlatoons: number;
  deltaFullPlatoons: number;

  changedAssignmentCount: number;
  displacedAssignmentCount: number;

  becameFullPlatoonIds: string[];
  noLongerFullPlatoonIds: string[];
};

export type PlatoonSimulatorResponse = {
  baseline: PlatoonMatchingResult;
  simulated: PlatoonMatchingResult;
  delta: PlatoonSimulatorDelta;
  steps: PlatoonSimulatorStepEffect[];
};

export type NextFullPlatoonResult = {
  targetPlatoonId: string;
  actions: PlatoonSimulatorAction[];
  deltaFullPlatoons: number;
  deltaCoveredSlots: number;
  changedAssignmentCount: number;
  displacedAssignmentCount: number;
};

export type SequentialFullPlatoonPlan = {
  first: NextFullPlatoonResult | null;
  second: NextFullPlatoonResult | null;
};