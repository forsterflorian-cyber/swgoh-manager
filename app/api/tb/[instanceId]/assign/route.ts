import { NextRequest } from 'next/server';

import { getAuthenticatedUser, userCanAccessTbInstance } from '@/lib/api/auth';
import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';
import { TbPlanningService } from '@/lib/services/tb-planning';

export const runtime = 'nodejs';

type AssignBody = {
  tbPlatoonSlotId?: unknown;
  memberId?: unknown;
};

type UnassignBody = {
  assignmentId?: unknown;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const { instanceId } = await params;
    const user = await getAuthenticatedUser();

    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    if (!(await userCanAccessTbInstance(user.id, instanceId))) {
      return jsonError('Forbidden', 403);
    }

    const body = await readJsonObject<AssignBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const tbPlatoonSlotId =
      typeof body.tbPlatoonSlotId === 'string' ? body.tbPlatoonSlotId : '';
    const memberId = typeof body.memberId === 'string' ? body.memberId : '';

    if (!tbPlatoonSlotId || !memberId) {
      return jsonError('tbPlatoonSlotId and memberId are required', 400);
    }

    const result = await TbPlanningService.assignPlayer(
      instanceId,
      tbPlatoonSlotId,
      memberId,
      user.id
    );

    if (!result.success) {
      return jsonError(result.error || 'Assignment failed', 400);
    }

    return jsonOk({ assigned: true });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Assignment failed',
      500
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const { instanceId } = await params;
    const user = await getAuthenticatedUser();

    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    if (!(await userCanAccessTbInstance(user.id, instanceId))) {
      return jsonError('Forbidden', 403);
    }

    const body = await readJsonObject<UnassignBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const assignmentId = typeof body.assignmentId === 'string' ? body.assignmentId : '';

    if (!assignmentId) {
      return jsonError('assignmentId is required', 400);
    }

    const result = await TbPlanningService.unassignPlayer(instanceId, assignmentId, user.id);
    if (!result.success) {
      return jsonError('Assignment not found', 404);
    }

    return jsonOk({ removed: true });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Unassign failed',
      500
    );
  }
}
