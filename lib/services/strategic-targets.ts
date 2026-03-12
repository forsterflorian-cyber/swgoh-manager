import { sql } from '@vercel/postgres';

import type {
  PlanetCategory,
  StrategicMemberAssignmentLoad,
  StrategicPlannerAssignmentInput,
} from '@/lib/types/platoon-readiness';

const PLANET_CATEGORIES: PlanetCategory[] = ['LS', 'DS', 'MIX', 'SPECIAL'];

export const MAX_STATIONS_PER_MEMBER_PER_PLANET = 10;

type GuildUpgradeAssignmentRow = {
  id: string;
  guild_id: string;
  guild_member_id: string;
  unit_base_id: string;
  planet_category: PlanetCategory | null;
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

type CreateGuildUpgradeAssignmentResult =
  | { success: true; assignmentId: string }
  | { success: false; error: string; status: number };

function createEmptyMemberAssignmentLoad(): StrategicMemberAssignmentLoad {
  return {
    LS: 0,
    DS: 0,
    MIX: 0,
    SPECIAL: 0,
    TOTAL: 0,
  };
}

export function isPlanetCategory(value: string): value is PlanetCategory {
  return PLANET_CATEGORIES.includes(value as PlanetCategory);
}

export function normalizePlanetCategory(value: string | null | undefined): PlanetCategory | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();
  return isPlanetCategory(normalizedValue) ? normalizedValue : null;
}

function mapAssignmentRow(row: GuildUpgradeAssignmentRow): StrategicPlannerAssignmentInput {
  return {
    id: row.id,
    guildId: row.guild_id,
    guildMemberId: row.guild_member_id,
    unitBaseId: row.unit_base_id,
    planetCategory: row.planet_category,
    note: row.note,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildMemberAssignmentLoadMap(
  assignments: Array<Pick<StrategicPlannerAssignmentInput, 'guildMemberId' | 'planetCategory'>>
): Record<string, StrategicMemberAssignmentLoad> {
  const loads: Record<string, StrategicMemberAssignmentLoad> = {};

  for (const assignment of assignments) {
    if (!loads[assignment.guildMemberId]) {
      loads[assignment.guildMemberId] = createEmptyMemberAssignmentLoad();
    }

    const memberLoad = loads[assignment.guildMemberId];
    memberLoad.TOTAL += 1;

    if (assignment.planetCategory) {
      memberLoad[assignment.planetCategory] += 1;
    }
  }

  return loads;
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
      planet_category,
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

export async function getMemberAssignmentLoad(
  guildId: string
): Promise<Record<string, StrategicMemberAssignmentLoad>> {
  const assignments = await listGuildUpgradeAssignments(guildId);
  return buildMemberAssignmentLoadMap(assignments);
}

export async function createGuildUpgradeAssignment(input: {
  guildId: string;
  guildMemberId: string;
  unitBaseId: string;
  createdByUserId: string;
  planetCategory?: PlanetCategory | null;
  note?: string | null;
}): Promise<CreateGuildUpgradeAssignmentResult> {
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
      status: 400,
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
      status: 400,
    };
  }

  if (input.planetCategory) {
    const memberLoadMap = await getMemberAssignmentLoad(input.guildId);
    const categoryLoad = memberLoadMap[input.guildMemberId]?.[input.planetCategory] ?? 0;

    if (categoryLoad >= MAX_STATIONS_PER_MEMBER_PER_PLANET) {
      return {
        success: false,
        error: 'member capacity reached for this planet category',
        status: 409,
      };
    }
  }

  const insertResult = await sql<{ id: string }>`
    INSERT INTO guild_upgrade_assignments (
      id,
      guild_id,
      guild_member_id,
      unit_base_id,
      planet_category,
      created_by_user_id,
      note
    )
    VALUES (
      gen_random_uuid(),
      ${input.guildId},
      ${input.guildMemberId},
      ${input.unitBaseId},
      ${input.planetCategory ?? null},
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
      status: 409,
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
