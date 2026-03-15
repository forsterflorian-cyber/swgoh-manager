import type { PlanetCategory, PlatoonMatchingResult, StrategicPlannerDataset } from '@/lib/types/platoon-readiness';

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
    }
  | {
      type: 'ADD_HYPOTHETICAL_UNIT';
      memberId: string;
      unitBaseId: string;
      rarity: number;
      relicTier: number;
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
  simulatedDataset: StrategicPlannerDataset;
  simulated: PlatoonMatchingResult;
  delta: PlatoonSimulatorDelta;
  steps: PlatoonSimulatorStepEffect[];
  targetPlatoonId: string | null;
  simulatedCoverageByPlatoon: Map<string, Set<string>>;
};

export type NextFullPlatoonResult = {
  targetPlatoonId: string;
  actions: PlatoonSimulatorAction[];
  deltaFullPlatoons: number;
  deltaCoveredSlots: number;
  changedAssignmentCount?: number;
  displacedAssignmentCount?: number;
  targetCoveredSlotsBefore: number;
  targetCoveredSlotsAfter: number;
  targetMissingSlotsBefore: number;
  targetMissingSlotsAfter: number;
  targetBecomesFull: boolean;
};

export type SequentialFullPlatoonPlan = {
  first: NextFullPlatoonResult | null;
  second: NextFullPlatoonResult | null;
};