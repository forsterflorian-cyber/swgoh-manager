import { NextRequest } from 'next/server';

import { GuildImportService } from '@/lib/services/guild-import';
import { RosterSyncService } from '@/lib/services/roster-sync';
import { sql } from '@vercel/postgres';
import { getAuthenticatedUser, userCanAccessGuild } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const { guildId } = await params;
    if (!(await userCanAccessGuild(user.id, guildId))) {
      return jsonError('Forbidden', 403);
    }

    const { searchParams } = new URL(request.url);
    const allyCode = searchParams.get('allyCode');

    if (!allyCode) {
      const guildResult = await sql<{
        swgoh_gg_id: string | null;
      }>`
        SELECT swgoh_gg_id
        FROM guilds
        WHERE id = ${guildId}
      `;

      const swgohGgId = guildResult.rows[0]?.swgoh_gg_id;
      if (!swgohGgId) {
        return jsonError('This guild has no SWGOH.GG guild id configured', 400);
      }

      const result = await GuildImportService.importFromSwgohGG(guildId, swgohGgId);
      return jsonOk({
        imported: result.imported,
        total: result.total,
      });
    }

    const syncedUnits = await RosterSyncService.syncPlayer(allyCode, guildId);
    return jsonOk({ syncedUnits });
  } catch (error: unknown) {
    console.error('Guild sync failed:', error);
    return jsonError(
      error instanceof Error ? error.message : 'Guild sync failed',
      500
    );
  }
}
