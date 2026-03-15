import { NextResponse } from 'next/server';
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item),
  );
}

function getTopLevelKeys(value: unknown): string[] {
  const record = asRecord(value);
  return record ? Object.keys(record).sort() : [];
}

function pickSlotSample(slots: Record<string, unknown>[]) {
  return slots.slice(0, 3).map((slot, index) => ({
    index,
    keys: Object.keys(slot).sort(),
    slotKey:
      typeof slot.slotKey === 'string'
        ? slot.slotKey
        : typeof slot.id === 'string'
          ? slot.id
          : typeof slot.key === 'string'
            ? slot.key
            : null,
    platoonId:
      typeof slot.platoonId === 'string'
        ? slot.platoonId
        : typeof slot.targetPlatoonId === 'string'
          ? slot.targetPlatoonId
          : null,
    unitBaseId:
      typeof slot.unitBaseId === 'string'
        ? slot.unitBaseId
        : typeof slot.baseId === 'string'
          ? slot.baseId
          : null,
    memberId:
      typeof slot.memberId === 'string'
        ? slot.memberId
        : null,
    planetCategory:
      typeof slot.planetCategory === 'string'
        ? slot.planetCategory
        : null,
    eligibleRosterCount: Array.isArray(slot.eligibleRoster) ? slot.eligibleRoster.length : 0,
    assignedRosterCount: Array.isArray(slot.assignedRoster) ? slot.assignedRoster.length : 0,
  }));
}

function pickStrategicAssignmentSample(assignments: Record<string, unknown>[]) {
  return assignments.slice(0, 3).map((item, index) => ({
    index,
    keys: Object.keys(item).sort(),
    memberId: typeof item.memberId === 'string' ? item.memberId : null,
    unitBaseId: typeof item.unitBaseId === 'string' ? item.unitBaseId : null,
    slotKey: typeof item.slotKey === 'string' ? item.slotKey : null,
    platoonId: typeof item.platoonId === 'string' ? item.platoonId : null,
    planetCategory:
      typeof item.planetCategory === 'string' ? item.planetCategory : null,
    blockType: typeof item.blockType === 'string' ? item.blockType : null,
  }));
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const actions = parseActions(body);

    const loaded = await loadStrategicPlannerDatasetForGuildSlug(slug);
    const root = asRecord(loaded);

    if (!root) {
      return NextResponse.json(
        { error: 'Loaded dataset is not an object.' },
        { status: 500 },
      );
    }

    const slots = asRecordArray(root.slots);
    const strategicAssignments = asRecordArray(root.strategicAssignments);
    const members = Array.isArray(root.members) ? root.members : [];
    const roster = asRecord(root.roster);

    return NextResponse.json(
      {
        simulation: {
          baseline: null,
          simulated: null,
          delta: {
            baselineCoveredSlots: 0,
            simulatedCoveredSlots: 0,
            deltaCoveredSlots: 0,
            baselineFullPlatoons: 0,
            simulatedFullPlatoons: 0,
            deltaFullPlatoons: 0,
            changedAssignmentCount: 0,
            displacedAssignmentCount: 0,
            becameFullPlatoonIds: [],
            noLongerFullPlatoonIds: [],
          },
        },
        advisory: {
          first: null,
          second: null,
        },
        debug: {
          slug,
          actionsCount: actions.length,
          topLevelKeys: getTopLevelKeys(root),
          membersCount: members.length,
          slotsCount: slots.length,
          strategicAssignmentsCount: strategicAssignments.length,
          rosterKeys: getTopLevelKeys(roster),
          slotSample: pickSlotSample(slots),
          strategicAssignmentSample: pickStrategicAssignmentSample(strategicAssignments),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Simulator API error', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed before simulation.',
      },
      { status: 500 },
    );
  }
}