import { NextRequest } from 'next/server';

import { getAuthenticatedUser } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { PlatoonReadinessService } from '@/lib/services/platoon-readiness';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fixture = searchParams.get('fixture');
    const guildId = searchParams.get('guildId')?.trim() || undefined;

    if (fixture === 'demo') {
      return jsonOk(PlatoonReadinessService.analyzeFixture('demo'));
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const analysis = await PlatoonReadinessService.analyzeForUser(user.id, {
      guildId,
      fixture,
    });

    return jsonOk(analysis);
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Strategic platoon readiness lookup failed',
      500
    );
  }
}
