import { NextRequest } from 'next/server';

import { sql } from '@vercel/postgres';
import {
  getAuthenticatedUser,
  getDiscordUserIdForUser,
  getRegisteredMemberForGuild,
} from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';

export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ guildId: string }> };

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

    // Resolve guild slug (needed for dataset loader)
    const guildResult = await sql<{ name: string; slug: string }>`
      SELECT name, slug FROM guilds WHERE id = ${guildId} LIMIT 1
    `;
    if (guildResult.rows.length === 0) {
      return jsonError('Guild not found', 404);
    }
    const { name: guildName, slug: guildSlug } = guildResult.rows[0];

    // Player name
    const memberResult = await sql<{ player_name: string }>`
      SELECT player_name FROM guild_members WHERE id = ${registration.guildMemberId} LIMIT 1
    `;
    const playerName = memberResult.rows[0]?.player_name ?? null;

    // --- Part A: Platoon matching assignments for this member ---
    const dataset = await loadStrategicPlannerDatasetForGuildSlug(guildSlug);
    const matching = dataset.guild && dataset.reference
      ? computePlatoonMatching(dataset)
      : null;

    const matchingAssignments = (matching?.assignments ?? [])
      .filter((a) => a.memberId === registration.guildMemberId)
      .map((a) => ({
        phase: a.phase,
        zoneName: a.zoneName,
        platoonNumber: a.platoonNumber,
        slotNumber: a.slotNumber,
        unitName: a.unitName,
        unitBaseId: a.unitBaseId,
      }));

    // Current relic tier for each assigned unit (from roster)
    const rosterByUnit = new Map(
      dataset.roster
        .filter((r) => r.memberId === registration.guildMemberId)
        .map((r) => [r.unitBaseId, r])
    );

    const platoonAssignments = matchingAssignments.map((a) => {
      const rosterEntry = rosterByUnit.get(a.unitBaseId);
      return {
        ...a,
        currentRelicTier: rosterEntry?.relicTier ?? null,
      };
    });

    // --- Part B: Upgrade path assignments for this member ---
    const upgradeRows = await sql<{
      unit_base_id: string;
      planet_category: string | null;
      note: string | null;
    }>`
      SELECT unit_base_id, planet_category, note
      FROM guild_upgrade_assignments
      WHERE guild_id = ${guildId}
        AND guild_member_id = ${registration.guildMemberId}
      ORDER BY created_at DESC
    `;

    // Enrich with unit name from roster cache
    const unitNames = new Map(dataset.roster.map((r) => [r.unitBaseId, r.unitName]));

    const upgradePaths = upgradeRows.rows.map((row) => ({
      unitBaseId: row.unit_base_id,
      unitName: unitNames.get(row.unit_base_id) ?? row.unit_base_id,
      planetCategory: row.planet_category,
      note: row.note,
      currentRelicTier: rosterByUnit.get(row.unit_base_id)?.relicTier ?? null,
    }));

    return jsonOk({
      playerName,
      guildName,
      guildSlug,
      hasRosterData: dataset.roster.length > 0,
      platoonAssignments,
      upgradePaths,
    });
  } catch (error: unknown) {
    console.error('my-assignments GET error:', error);
    return jsonError('Failed to load assignments', 500);
  }
}
