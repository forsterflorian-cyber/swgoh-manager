import { NextRequest } from 'next/server';
import { sql } from '@vercel/postgres';

import { getAuthenticatedUser, userCanManageGuild } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getPrimaryGuildSettingsForUser } from '@/lib/services/guild-settings';
import { syncGuildRosters } from '@/lib/services/guild-roster-sync';

export const runtime = 'nodejs';

const BATCH_LIMIT_DEFAULT = 5;
const BATCH_LIMIT_MAX = 20;

/**
 * POST /api/guild/roster-sync?limit=5&offset=0
 *dd
 * Syncs one batch of guild member rosters from Comlink into player_roster.
 * Call repeatedly with increasing offset until done=true.
 *
 * Query params:
 *   limit  — members per batch (default 5, max 20)
 *   offset — starting index into the eligible member list (default 0)
 */
export async function POST(request: NextRequest) {
  console.log('[roster-sync] route hit');
  const user = await getAuthenticatedUser();
  if (!user) {
    console.warn('[roster-sync] route hit but user not authenticated');
    return jsonError('Not authenticated', 401);
  }

  const guild = await getPrimaryGuildSettingsForUser(user.id);
  if (!guild) {
    return jsonError('Guild not found', 404);
  }

  if (!(await userCanManageGuild(user.id, guild.id))) {
    return jsonError('Not authorized', 403);
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get('limit') ?? String(BATCH_LIMIT_DEFAULT), 10) || BATCH_LIMIT_DEFAULT),
    BATCH_LIMIT_MAX
  );
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  console.log(`[roster-sync] batch params: limit=${limit} offset=${offset}`);

  try {
    const result = await syncGuildRosters(guild.id, { limit, offset });

    const nextOffset = offset + result.membersConsidered;
    const done = nextOffset >= result.totalEligibleMembers;
    const remainingMembers = Math.max(0, result.totalEligibleMembers - nextOffset);

    return jsonOk({
      processedMembers: result.membersConsidered,
      totalEligibleMembers: result.totalEligibleMembers,
      remainingMembers,
      upserts: result.totalUpserts,
      upsertErrors: result.totalUpsertErrors,
      done,
      nextOffset,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Roster sync failed';

    if (message === 'Comlink service is waking up or unavailable') {
      return jsonError(message, 503);
    }
    if (message.includes('player_roster table not found')) {
      return jsonError(message, 500);
    }

    console.error('[api/guild/roster-sync] Roster sync failed:', error);
    return jsonError('Roster sync failed', 500);
  }
}

/**
 * GET /api/guild/roster-sync
 *
 * Returns roster sync status for the user's guild:
 * - total members with player_id (eligible for sync)
 * - members with at least one roster row synced
 * - total roster rows stored
 * - last sync timestamp
 */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return jsonError('Not authenticated', 401);
  }

  const guild = await getPrimaryGuildSettingsForUser(user.id);
  if (!guild) {
    return jsonError('Guild not found', 404);
  }

  const membersResult = await sql<{ total: number }>`
    SELECT COUNT(*)::int AS total
    FROM guild_members
    WHERE guild_id = ${guild.id}
      AND player_id IS NOT NULL
  `;

  const rosterResult = await sql<{
    members_synced: number;
    total_rows: number;
    last_synced_at: string | null;
  }>`
    SELECT
      COUNT(DISTINCT player_id)::int AS members_synced,
      COUNT(*)::int                  AS total_rows,
      MAX(last_synced)               AS last_synced_at
    FROM player_roster
    WHERE guild_id = ${guild.id}
  `;

  const totalMembers = membersResult.rows[0]?.total ?? 0;
  const stats = rosterResult.rows[0];

  return jsonOk({
    guildId: guild.id,
    totalMembersEligible: totalMembers,
    membersSynced: stats?.members_synced ?? 0,
    totalRosterRows: stats?.total_rows ?? 0,
    lastSyncedAt: stats?.last_synced_at ?? null,
    rosterAvailable: (stats?.members_synced ?? 0) > 0,
  });
}
