import { NextRequest } from 'next/server';

import { getAuthenticatedUser } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadMyAssignmentsForGuild } from '@/lib/services/my-assignments';

export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ guildId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return jsonError('Unauthorized', 401);

    const { guildId } = await params;
    const result = await loadMyAssignmentsForGuild(user.id, guildId);

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonOk(result.data);
  } catch (error: unknown) {
    console.error('my-assignments GET error:', error);
    return jsonError('Failed to load assignments', 500);
  }
}
