import { NextRequest } from 'next/server';

import { getAuthenticatedUser, userCanAccessTbInstance } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { TbPlanningService } from '@/lib/services/tb-planning';
import { toNumber } from '@/lib/utils/to-number';

export const runtime = 'nodejs';

export async function GET(
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

    const { searchParams } = new URL(request.url);
    const phase = toNumber(searchParams.get('phase') || '1', 1);
    const zoneKey = searchParams.get('zone');

    if (phase < 1) {
      return jsonError('phase must be a positive integer', 400);
    }

    if (!zoneKey) {
      const analysis = await TbPlanningService.analyzePhase(instanceId, phase);
      return jsonOk(analysis);
    }

    const analysis = await TbPlanningService.analyzeZone(instanceId, phase, zoneKey);
    return jsonOk(analysis);
  } catch (error: unknown) {
    console.error('TB gap analysis failed:', error);
    return jsonError(
      error instanceof Error ? error.message : 'Gap analysis failed',
      500
    );
  }
}
