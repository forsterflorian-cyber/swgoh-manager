import type {
  PlanetCategory,
  StrategicMemberAssignmentLoad,
  StrategicPlannerData,
  StrategicPlannerSummary,
  StrategicRequirementSummary,
  StrategicTargetAssignment,
  StrategicTargetCandidate,
  StrategicUnitImpact,
  StrategicZoneReadiness,
  PlatoonMatchingGap,
} from '@/lib/types/platoon-readiness';

export type Notice = {
  tone: 'success' | 'error';
  message: string;
};

export type SelectedCoverageCell = {
  phase: number;
  category: PlanetCategory;
} | null;

export type PlannerPlatoonCardData = {
  phase: number;
  zoneKey: string;
  zoneName: string;
  platoonKey: string;
  platoonNumber: number;
  totalSlots: number;
  filledSlots: number;
  missingSlots: number;
  status: 'ready' | 'partial' | 'blocked';
  slots: Array<{
    slotKey: string;
    slotNumber: number;
    unitName: string;
    status: StrategicRequirementSummary['status'];
  }>;
};

export type MatchingPlatoonRow =
  | {
      kind: 'assigned';
      requirementId: string;
      slotNumber: number;
      unitName: string;
      playerName: string;
    }
  | {
      kind: 'open';
      requirementId: string;
      slotNumber: number;
      unitName: string;
      action: string;
    };

export type MatchingPlatoonSection = {
  platoonKey: string;
  platoonNumber: number;
  zoneName: string;
  rows: MatchingPlatoonRow[];
  assignedCount: number;
  openCount: number;
  totalCount: number;
};

export type PlannerViewKey = 'overview' | 'priorities' | 'targets' | 'matching';

export const MAX_STATIONS_PER_MEMBER_PER_PLANET = 10;

export const PLANNER_VIEW_ITEMS: Array<{
  key: PlannerViewKey;
  label: string;
  description: string;
}> = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'Guild health, top blockers, and immediate next actions.',
  },
  {
    key: 'priorities',
    label: 'Missing Units',
    description: 'Ranked bottlenecks with zone pressure and upgrade leverage.',
  },
  {
    key: 'targets',
    label: 'Member Targets',
    description: 'Assignments, candidate workflow, and ownership planning.',
  },
  {
    key: 'matching',
    label: 'Matching',
    description: 'Optimal slot assignments by phase and category, with gap closure paths.',
  },
];

export function isPlannerViewKey(value: string | null): value is PlannerViewKey {
  return (
    value === 'overview' ||
    value === 'priorities' ||
    value === 'targets' ||
    value === 'matching'
  );
}

export function buildPlannerViewHref(view: PlannerViewKey, fixture: string | null) {
  const params = new URLSearchParams();

  if (fixture === 'demo') {
    params.set('fixture', 'demo');
  }

  if (view !== 'overview') {
    params.set('view', view);
  }

  const query = params.toString();
  return query ? `/planning/platoons?${query}` : '/planning/platoons';
}

export type ProgressionBucket = 'actionable_now' | 'next_up' | 'later';

export const BUCKET_ORDER: Record<ProgressionBucket, number> = {
  actionable_now: 0,
  next_up: 1,
  later: 2,
};
