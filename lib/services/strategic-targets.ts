import { sql } from '@vercel/postgres';

import type { StrategicPlannerAssignmentInput } from '@/lib/types/platoon-readiness';

type GuildUpgradeAssignmentRow = {
  id: string;
  guild_id: string;
  guild_member_id: string;
  unit_base_id: string;
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type GuildMemberRow = {
  id: string;
};

type ReferenceUnitRow = {
  unit_name: string | null;
};

function mapAssignmentRow(row: GuildUpgradeAssignmentRow): StrategicPlannerAssignmentInput {
  return {
    id: row.id,
    guildId: row.guild_id,
    guildMemberId: row.guild_member_id,
    unitBaseId: row.unit_base_id,
    note: row.note,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGuildUpgradeAssignments(
  guildId: string
): Promise<StrategicPlannerAssignmentInput[]> {
  const result = await sql<GuildUpgradeAssignmentRow>`
    SELECT
      id,
      guild_id,
      guild_member_id,
      unit_base_id,
      note,
      created_by_user_id,
      created_at::text,
      updated_at::text
    FROM guild_upgrade_assignments
    WHERE guild_id = ${guildId}
    ORDER BY created_at DESC, id DESC
  `;

  return result.rows.map(mapAssignmentRow);
}

export async function createGuildUpgradeAssignment(input: {
  guildId: string;
  guildMemberId: string;
  unitBaseId: string;
  createdByUserId: string;
  note?: string | null;
}): Promise<{ success: true; assignmentId: string } | { success: false; error: string }> {
  const memberResult = await sql<GuildMemberRow>`
    SELECT id
    FROM guild_members
    WHERE id = ${input.guildMemberId}
      AND guild_id = ${input.guildId}
    LIMIT 1
  `;

  if (memberResult.rows.length === 0) {
    return {
      success: false,
      error: 'Guild member not found for this guild.',
    };
  }

  const unitResult = await sql<ReferenceUnitRow>`
    SELECT tps.unit_name
    FROM tb_definitions td
    JOIN tb_phases tp ON tp.tb_definition_id = td.id
    JOIN tb_zones tz ON tz.tb_phase_id = tp.id
    JOIN tb_platoons tpl ON tpl.tb_zone_id = tz.id
    JOIN tb_platoon_slots tps ON tps.tb_platoon_id = tpl.id
    WHERE td.is_active = true
      AND tps.unit_base_id = ${input.unitBaseId}
    ORDER BY td.updated_at DESC, td.created_at DESC, tps.updated_at DESC
    LIMIT 1
  `;

  if (unitResult.rows.length === 0) {
    return {
      success: false,
      error: 'Target unit is not part of the active strategic platoon reference.',
    };
  }

  const insertResult = await sql<{ id: string }>`
    INSERT INTO guild_upgrade_assignments (
      id,
      guild_id,
      guild_member_id,
      unit_base_id,
      created_by_user_id,
      note
    )
    VALUES (
      gen_random_uuid(),
      ${input.guildId},
      ${input.guildMemberId},
      ${input.unitBaseId},
      ${input.createdByUserId},
      ${input.note?.trim() || null}
    )
    ON CONFLICT (guild_id, guild_member_id, unit_base_id) DO NOTHING
    RETURNING id
  `;

  if (insertResult.rows.length === 0) {
    return {
      success: false,
      error: 'This member already has that strategic target assigned.',
    };
  }

  return {
    success: true,
    assignmentId: insertResult.rows[0].id,
  };
}

export async function getGuildIdForUpgradeAssignment(
  assignmentId: string
): Promise<string | null> {
  const result = await sql<{ guild_id: string }>`
    SELECT guild_id
    FROM guild_upgrade_assignments
    WHERE id = ${assignmentId}
    LIMIT 1
  `;

  return result.rows[0]?.guild_id ?? null;
}

export async function removeGuildUpgradeAssignment(assignmentId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM guild_upgrade_assignments
    WHERE id = ${assignmentId}
  `;

  return (result.rowCount ?? 0) > 0;
}
