import type { PlanetCategory, PlatoonMatchingResult, StrategicPlannerDataset } from '@/lib/types/platoon-readiness';

export type PlatoonSimulatorActionAlternative = {
  memberId: string;
  playerName: string;
  unitBaseId: string;
  unitName: string;
  missingRelicTiers: number;
  missingRarity: number;
  actionCost: number;
  displacedAssignmentCount?: number;
};


export type PlatoonSimulatorAction =
  | {
      id: string;
      type: 'USE_UNUSED_OWNER';
      requirementId: string;
      memberId: string;
      playerName: string;
      unitBaseId: string;
      unitName: string;
      missingRelicTiers: 0;
      missingRarity: 0;
      alternatives?: PlatoonSimulatorActionAlternative[];
    }
  | {
      id: string;
      type: 'UPGRADE_OWNER_UNIT';
      requirementId: string;
      memberId: string;
      playerName: string;
      unitBaseId: string;
      unitName: string;
      missingRelicTiers: number;
      missingRarity: number;
      actionCost?: number;
      alternatives?: PlatoonSimulatorActionAlternative[];
    }
  | {
      id: string;
      type: 'REMOVE_SOURCE_BLOCK';
      requirementId?: string;
      memberId: string;
      playerName: string;
      unitBaseId: string;
      unitName: string;
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

  baselineFullZones: number;
  simulatedFullZones: number;
  deltaFullZones: number;

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
  deltaCoveredSlots: number;
  deltaFullPlatoons: number;
  changedAssignmentCount?: number;
  displacedAssignmentCount?: number;
  becameFullPlatoonIds?: string[];
  noLongerFullPlatoonIds?: string[];
  targetCoveredSlotsBefore: number;
  targetCoveredSlotsAfter: number;
  targetMissingSlotsBefore: number;
  targetMissingSlotsAfter: number;
  targetBecomesFull: boolean;
  actionCost?: number;
};

export type SequentialFullPlatoonPlan = {
  first: NextFullPlatoonResult | null;
  second: NextFullPlatoonResult | null;
};