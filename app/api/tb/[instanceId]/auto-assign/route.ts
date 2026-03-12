import { NextRequest } from 'next/server';

import { getAuthenticatedUser, userCanAccessTbInstance } from '@/lib/api/auth';
import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';
import { TbPlanningService } from '@/lib/services/tb-planning';
import { toNumber } from '@/lib/utils/to-number';

export const runtime = 'nodejs';

type AutoAssignBody = {
  phase?: unknown;
  zoneKey?: unknown;
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

    const body = await readJsonObject<AutoAssignBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const phase = toNumber(body.phase || '');
    const zoneKey = typeof body.zoneKey === 'string' ? body.zoneKey : '';

    if (!phase || !zoneKey) {
      return jsonError('phase and zoneKey are required', 400);
    }

    const result = await TbPlanningService.autoAssignZone(
      instanceId,
      phase,
      zoneKey,
      user.id
    );

    return jsonOk({
      assigned: result.assigned,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Auto assign failed',
      500
    );
  }
}
