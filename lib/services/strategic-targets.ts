import { sql } from '@vercel/postgres';
import type { VercelPoolClient } from '@vercel/postgres';

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

type ReferenceUnitRow = {
  unit_name: string | null;
};

type GuildMemberScopeRow = {
  id: string;
  guild_id: string;
};

type ExistingGuildUpgradeAssignmentRow = {
  id: string;
  planet_category: PlanetCategory | null;
  note: string | null;
};

type AssignmentCountRow = {
  assignment_count: string | number;
};

type StrategicTargetWriteErrorCode =
  | 'ASSIGNMENT_NOT_FOUND'
  | 'CAPACITY_REACHED'
  | 'CONFLICT'
  | 'GUILD_CONTEXT_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'MALFORMED_INPUT'
  | 'NOT_AUTHORIZED'
  | 'TARGET_UNIT_INVALID';

type StrategicTargetWriteError = {
  success: false;
  code: StrategicTargetWriteErrorCode;
  error: string;
  status: number;
};

export type SaveGuildUpgradeAssignmentResult =
  | {
      success: true;
      assignmentId: string;
      guildId: string;
      writeMode: 'created' | 'updated' | 'unchanged';
    }
  | StrategicTargetWriteError;

export type DeleteGuildUpgradeAssignmentResult =
  | {
      success: true;
      assignmentId: string;
      guildId: string;
    }
  | StrategicTargetWriteError;

class StrategicTargetWriteServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: StrategicTargetWriteErrorCode
  ) {
    super(message);
    this.name = 'StrategicTargetWriteServiceError';
  }
}

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

function normalizeRequiredIdentifier(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function normalizeOptionalNote(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function toAssignmentCount(value: string | number | undefined) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function toWriteError(
  message: string,
  status: number,
  code: StrategicTargetWriteErrorCode
): StrategicTargetWriteError {
  return {
    success: false,
    code,
    error: message,
    status,
  };
}

function mapUnexpectedWriteError(error: unknown): StrategicTargetWriteError {
  if (error instanceof StrategicTargetWriteServiceError) {
    return toWriteError(error.message, error.status, error.code);
  }

  const postgresError = error as (Error & { code?: string }) | null;
  switch (postgresError?.code) {
    case '23502':
    case '23514':
      return toWriteError('Malformed input', 400, 'MALFORMED_INPUT');
    case '23503':
      return toWriteError('Guild context not found', 404, 'GUILD_CONTEXT_NOT_FOUND');
    case '23505':
      return toWriteError('Assignment already exists', 409, 'CONFLICT');
    default:
      return toWriteError('Strategic target write failed', 500, 'INTERNAL_ERROR');
  }
}

async function ensureManageableGuildScope(
  client: VercelPoolClient,
  actorUserId: string,
  guildMemberId: string
) {
  const memberResult = await client.sql<GuildMemberScopeRow>`
    SELECT id, guild_id
    FROM guild_members
    WHERE id = ${guildMemberId}
    LIMIT 1
    FOR UPDATE
  `;

  const member = memberResult.rows[0];
  if (!member) {
    throw new StrategicTargetWriteServiceError(
      'Guild context not found',
      404,
      'GUILD_CONTEXT_NOT_FOUND'
    );
  }

  const permissionResult = await client.sql`
    SELECT 1
    FROM permissions
    WHERE user_id = ${actorUserId}
      AND guild_id = ${member.guild_id}
      AND role IN ('owner', 'admin', 'officer')
    LIMIT 1
  `;

  if (permissionResult.rows.length === 0) {
    throw new StrategicTargetWriteServiceError('Not authorized', 403, 'NOT_AUTHORIZED');
  }

  return member;
}

async function assertUnitIsStrategicReference(
  client: VercelPoolClient,
  unitBaseId: string
) {
  const unitResult = await client.sql<ReferenceUnitRow>`
    SELECT tps.unit_name
    FROM tb_definitions td
    JOIN tb_phases tp ON tp.tb_definition_id = td.id
    JOIN tb_zones tz ON tz.tb_phase_id = tp.id
    JOIN tb_platoons tpl ON tpl.tb_zone_id = tz.id
    JOIN tb_platoon_slots tps ON tps.tb_platoon_id = tpl.id
    WHERE td.is_active = true
      AND tps.unit_base_id = ${unitBaseId}
    ORDER BY td.updated_at DESC, td.created_at DESC, tps.updated_at DESC
    LIMIT 1
  `;

  if (unitResult.rows.length === 0) {
    throw new StrategicTargetWriteServiceError(
      'Target unit is not part of the active strategic platoon reference.',
      400,
      'TARGET_UNIT_INVALID'
    );
  }
}

async function getExistingAssignment(
  client: VercelPoolClient,
  guildId: string,
  guildMemberId: string,
  unitBaseId: string
) {
  const result = await client.sql<ExistingGuildUpgradeAssignmentRow>`
    SELECT id, planet_category, note
    FROM guild_upgrade_assignments
    WHERE guild_id = ${guildId}
      AND guild_member_id = ${guildMemberId}
      AND unit_base_id = ${unitBaseId}
    LIMIT 1
    FOR UPDATE
  `;

  return result.rows[0] ?? null;
}

async function assertMemberCapacity(
  client: VercelPoolClient,
  input: {
    existingAssignmentId: string | null;
    guildId: string;
    guildMemberId: string;
    planetCategory: PlanetCategory | null;
  }
) {
  if (!input.planetCategory) {
    return;
  }

  const countResult = input.existingAssignmentId
    ? await client.sql<AssignmentCountRow>`
        SELECT COUNT(*) AS assignment_count
        FROM guild_upgrade_assignments
        WHERE guild_id = ${input.guildId}
          AND guild_member_id = ${input.guildMemberId}
          AND planet_category = ${input.planetCategory}
          AND id <> ${input.existingAssignmentId}
      `
    : await client.sql<AssignmentCountRow>`
        SELECT COUNT(*) AS assignment_count
        FROM guild_upgrade_assignments
        WHERE guild_id = ${input.guildId}
          AND guild_member_id = ${input.guildMemberId}
          AND planet_category = ${input.planetCategory}
      `;

  if (toAssignmentCount(countResult.rows[0]?.assignment_count) >= MAX_STATIONS_PER_MEMBER_PER_PLANET) {
    throw new StrategicTargetWriteServiceError(
      'Member capacity reached for this planet category',
      409,
      'CAPACITY_REACHED'
    );
  }
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
  // Strategic targets use a single active-row lifecycle: a row exists only while the
  // assignment is active, saves update that row in place, and deletes remove it outright.
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

export async function saveGuildUpgradeAssignment(input: {
  actorUserId: string;
  guildMemberId: string;
  unitBaseId: string;
  planetCategory?: PlanetCategory | null;
  note?: string | null;
}): Promise<SaveGuildUpgradeAssignmentResult> {
  const actorUserId = normalizeRequiredIdentifier(input.actorUserId);
  const guildMemberId = normalizeRequiredIdentifier(input.guildMemberId);
  const unitBaseId = normalizeRequiredIdentifier(input.unitBaseId);
  const note = normalizeOptionalNote(input.note);
  const planetCategory = input.planetCategory ?? null;

  if (!actorUserId || !guildMemberId || !unitBaseId) {
    return toWriteError(
      'guildMemberId and unitBaseId are required',
      400,
      'MALFORMED_INPUT'
    );
  }

  const client = (await sql.connect()) as VercelPoolClient;
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const member = await ensureManageableGuildScope(client, actorUserId, guildMemberId);
    await assertUnitIsStrategicReference(client, unitBaseId);

    const existingAssignment = await getExistingAssignment(
      client,
      member.guild_id,
      guildMemberId,
      unitBaseId
    );

    await assertMemberCapacity(client, {
      existingAssignmentId: existingAssignment?.id ?? null,
      guildId: member.guild_id,
      guildMemberId,
      planetCategory,
    });

    const writeMode =
      !existingAssignment
        ? 'created'
        : existingAssignment.planet_category === planetCategory &&
            normalizeOptionalNote(existingAssignment.note) === note
          ? 'unchanged'
          : 'updated';

    const insertResult = await client.sql<{ id: string }>`
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
        ${member.guild_id},
        ${guildMemberId},
        ${unitBaseId},
        ${planetCategory},
        ${actorUserId},
        ${note}
      )
      ON CONFLICT (guild_id, guild_member_id, unit_base_id)
      DO UPDATE SET
        planet_category = EXCLUDED.planet_category,
        note = EXCLUDED.note,
        updated_at = CASE
          WHEN guild_upgrade_assignments.planet_category IS DISTINCT FROM EXCLUDED.planet_category
            OR guild_upgrade_assignments.note IS DISTINCT FROM EXCLUDED.note
          THEN NOW()
          ELSE guild_upgrade_assignments.updated_at
        END
      RETURNING id
    `;

    await client.query('COMMIT');
    transactionOpen = false;

    return {
      success: true,
      assignmentId: insertResult.rows[0].id,
      guildId: member.guild_id,
      writeMode,
    };
  } catch (error: unknown) {
    if (transactionOpen) {
      await client.query('ROLLBACK');
    }

    return mapUnexpectedWriteError(error);
  } finally {
    client.release();
  }
}

export async function deleteGuildUpgradeAssignment(input: {
  actorUserId: string;
  assignmentId: string;
}): Promise<DeleteGuildUpgradeAssignmentResult> {
  const actorUserId = normalizeRequiredIdentifier(input.actorUserId);
  const assignmentId = normalizeRequiredIdentifier(input.assignmentId);

  if (!actorUserId || !assignmentId) {
    return toWriteError('assignmentId is required', 400, 'MALFORMED_INPUT');
  }

  const client = (await sql.connect()) as VercelPoolClient;
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const assignmentResult = await client.sql<{ id: string; guild_id: string }>`
      SELECT id, guild_id
      FROM guild_upgrade_assignments
      WHERE id = ${assignmentId}
      LIMIT 1
      FOR UPDATE
    `;

    const assignment = assignmentResult.rows[0];
    if (!assignment) {
      throw new StrategicTargetWriteServiceError(
        'Strategic target not found',
        404,
        'ASSIGNMENT_NOT_FOUND'
      );
    }

    const permissionResult = await client.sql`
      SELECT 1
      FROM permissions
      WHERE user_id = ${actorUserId}
        AND guild_id = ${assignment.guild_id}
        AND role IN ('owner', 'admin', 'officer')
      LIMIT 1
    `;

    if (permissionResult.rows.length === 0) {
      throw new StrategicTargetWriteServiceError('Not authorized', 403, 'NOT_AUTHORIZED');
    }

    await client.sql`
      DELETE FROM guild_upgrade_assignments
      WHERE id = ${assignmentId}
    `;

    await client.query('COMMIT');
    transactionOpen = false;

    return {
      success: true,
      assignmentId,
      guildId: assignment.guild_id,
    };
  } catch (error: unknown) {
    if (transactionOpen) {
      await client.query('ROLLBACK');
    }

    return mapUnexpectedWriteError(error);
  } finally {
    client.release();
  }
}
