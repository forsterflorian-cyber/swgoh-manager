import { NextRequest } from 'next/server';

import { sql } from '@vercel/postgres';
import {
  getAuthenticatedUser,
  getDiscordUserIdForUser,
  getRegisteredMemberForGuild,
} from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ guildId: string }> };

type AssignmentRow = {
  unit_name: string | null;
  required_relic_tier: number | null;
  zone_name: string;
  platoon_number: number;
  slot_number: number;
  status: string;
  player_relic_at_assignment: number;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const discordUserId = await getDiscordUserIdForUser(user.id);
    if (!discordUserId) {
      return jsonError('Discord identity not linked. Please log out and log back in.', 422);
    }

    const { guildId } = await params;

    const registration = await getRegisteredMemberForGuild(discordUserId, guildId);
    if (!registration) {
      return jsonError('Not registered as a member of this guild', 403);
    }

    // Get guild name for context
    const guildResult = await sql<{ name: string; slug: string }>`
      SELECT name, slug FROM guilds WHERE id = ${guildId} LIMIT 1
    `;
    if (guildResult.rows.length === 0) {
      return jsonError('Guild not found', 404);
    }

    // Get player name from guild_members
    const memberResult = await sql<{ player_name: string }>`
      SELECT player_name FROM guild_members WHERE id = ${registration.guildMemberId} LIMIT 1
    `;
    const playerName = memberResult.rows[0]?.player_name ?? null;

    // Find the most relevant TB instance (active preferred, then planning)
    const tbResult = await sql<{ id: string; name: string | null; definition_name: string; status: string }>`
      SELECT ti.id, ti.name, td.name AS definition_name, ti.status
      FROM tb_instances ti
      JOIN tb_definitions td ON td.id = ti.tb_definition_id
      WHERE ti.guild_id = ${guildId}
        AND ti.status IN ('active', 'planning')
      ORDER BY
        CASE ti.status WHEN 'active' THEN 0 ELSE 1 END,
        ti.created_at DESC
      LIMIT 1
    `;

    if (tbResult.rows.length === 0) {
      return jsonOk({
        assignments: [],
        playerName,
        guildName: guildResult.rows[0].name,
        guildSlug: guildResult.rows[0].slug,
        activeTbName: null,
        debug: { tbInstanceId: null, tbStatus: null, guildMemberId: registration.guildMemberId },
      });
    }

    const tb = tbResult.rows[0];
    const tbName = tb.name || tb.definition_name;

    const assignments = await sql<AssignmentRow>`
      SELECT
        tps.unit_name,
        tps.required_relic_tier,
        tz.name  AS zone_name,
        tp.platoon_number,
        tps.slot_number,
        ta.status,
        ta.player_relic_at_assignment
      FROM tb_assignments ta
      JOIN tb_platoon_slots tps ON tps.id = ta.tb_platoon_slot_id
      JOIN tb_platoons      tp  ON tp.id  = tps.tb_platoon_id
      JOIN tb_zones         tz  ON tz.id  = tp.tb_zone_id
      WHERE ta.tb_instance_id = ${tb.id}
        AND ta.guild_member_id = ${registration.guildMemberId}
        AND ta.tb_platoon_slot_id IS NOT NULL
      ORDER BY tz.name, tp.platoon_number, tps.slot_number
    `;

    return jsonOk({
      assignments: assignments.rows.map((row) => ({
        unitName: row.unit_name,
        requiredRelicTier: row.required_relic_tier,
        zoneName: row.zone_name,
        platoonNumber: row.platoon_number,
        slotNumber: row.slot_number,
        status: row.status,
        playerRelicAtAssignment: row.player_relic_at_assignment,
      })),
      playerName,
      guildName: guildResult.rows[0].name,
      guildSlug: guildResult.rows[0].slug,
      activeTbName: tbName,
      debug: { tbInstanceId: tb.id, tbStatus: tb.status, guildMemberId: registration.guildMemberId },
    });
  } catch (error: unknown) {
    console.error('my-assignments GET error:', error);
    return jsonError('Failed to load assignments', 500);
  }
}
