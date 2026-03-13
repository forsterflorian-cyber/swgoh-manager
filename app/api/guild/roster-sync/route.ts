import { sql } from '@vercel/postgres';

import { getAuthenticatedUser, userCanManageGuild } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getPrimaryGuildSettingsForUser } from '@/lib/services/guild-settings';
import { syncGuildRosters } from '@/lib/services/guild-roster-sync';

export const runtime = 'nodejs';

/**
 * POST /api/guild/roster-sync
 *
 * Triggers a full roster sync for all guild members from Comlink into player_roster.
 * Requires the user to have a manage role in their guild.
 * Requires guild members to already be synced (guild_members with player_id set).
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return jsonError('Not authenticated', 401);
  }

  const guild = await getPrimaryGuildSettingsForUser(user.id);
  if (!guild) {
    return jsonError('Guild not found', 404);
  }

  if (!(await userCanManageGuild(user.id, guild.id))) {
    return jsonError('Not authorized', 403);
  }

  try {
    const result = await syncGuildRosters(guild.id);

    return jsonOk({
      success: true,
      guildId: result.guildId,
      membersConsidered: result.membersConsidered,
      membersSkipped: result.membersSkipped,
      membersFetched: result.membersFetched,
      totalRosterRows: result.totalRosterRows,
      totalUpserts: result.totalUpserts,
      totalUpsertErrors: result.totalUpsertErrors,
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
