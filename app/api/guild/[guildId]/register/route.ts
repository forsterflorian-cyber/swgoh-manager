import { NextRequest } from 'next/server';

import { sql } from '@vercel/postgres';
import { getAuthenticatedUser, getDiscordUserIdForUser } from '@/lib/api/auth';
import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';

export const runtime = 'nodejs';

type RegisterBody = {
  allyCode?: unknown;
};

type RouteParams = { params: Promise<{ guildId: string }> };

type RegistrationRow = {
  id: string;
  guild_id: string;
  discord_user_id: string;
  ally_code: string;
  guild_member_id: string;
  status: string;
  registered_at: string;
  updated_at: string;
};

function normalizeAllyCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return /^\d{9}$/.test(digits) ? digits : null;
}

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

    const result = await sql<RegistrationRow>`
      SELECT id, guild_id, discord_user_id, ally_code, guild_member_id, status, registered_at, updated_at
      FROM registered_members
      WHERE guild_id = ${guildId}
        AND discord_user_id = ${discordUserId}
      LIMIT 1
    `;

    return jsonOk({ registration: result.rows[0] ?? null });
  } catch (error: unknown) {
    console.error('Register GET error:', error);
    return jsonError('Failed to fetch registration', 500);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const discordUserId = await getDiscordUserIdForUser(user.id);
    if (!discordUserId) {
      return jsonError('Discord identity not linked. Please log out and log back in.', 422);
    }

    const body = await readJsonObject<RegisterBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const allyCode = normalizeAllyCode(body.allyCode);
    if (!allyCode) {
      return jsonError('Ally code must be exactly 9 digits', 400);
    }

    const { guildId } = await params;

    // Check guild exists
    const guildResult = await sql<{ id: string }>`
      SELECT id FROM guilds WHERE id = ${guildId} LIMIT 1
    `;
    if (guildResult.rows.length === 0) {
      return jsonError('Guild not found', 404);
    }

    // Require matching guild_members row
    const memberResult = await sql<{ id: string }>`
      SELECT id FROM guild_members
      WHERE guild_id = ${guildId}
        AND ally_code = ${allyCode}
      LIMIT 1
    `;
    if (memberResult.rows.length === 0) {
      return jsonError('Ally code not found in guild roster', 409);
    }
    const guildMemberId = memberResult.rows[0].id;

    // Check ally_code not claimed by a different Discord user
    const allyClash = await sql<{ id: string }>`
      SELECT id FROM registered_members
      WHERE guild_id = ${guildId}
        AND ally_code = ${allyCode}
        AND discord_user_id != ${discordUserId}
      LIMIT 1
    `;
    if (allyClash.rows.length > 0) {
      return jsonError('Ally code already claimed by another user', 409);
    }

    // Check this Discord user not already registered to a different ally_code
    const discordClash = await sql<{ id: string; ally_code: string }>`
      SELECT id, ally_code FROM registered_members
      WHERE guild_id = ${guildId}
        AND discord_user_id = ${discordUserId}
        AND ally_code != ${allyCode}
      LIMIT 1
    `;
    if (discordClash.rows.length > 0) {
      return jsonError(
        'You are already registered with a different ally code. Delete your registration first.',
        409
      );
    }

    // Upsert — idempotent for same (guild, discord user, ally_code)
    const upsertResult = await sql<RegistrationRow>`
      INSERT INTO registered_members (id, guild_id, discord_user_id, ally_code, guild_member_id, status)
      VALUES (gen_random_uuid(), ${guildId}, ${discordUserId}, ${allyCode}, ${guildMemberId}, 'active')
      ON CONFLICT (guild_id, discord_user_id)
      DO UPDATE SET
        guild_member_id = EXCLUDED.guild_member_id,
        updated_at = NOW()
      RETURNING id, guild_id, discord_user_id, ally_code, guild_member_id, status, registered_at, updated_at
    `;

    return jsonOk({ registration: upsertResult.rows[0] });
  } catch (error: unknown) {
    console.error('Register POST error:', error);
    return jsonError('Registration failed', 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
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

    const result = await sql`
      DELETE FROM registered_members
      WHERE guild_id = ${guildId}
        AND discord_user_id = ${discordUserId}
    `;

    if (result.rowCount === 0) {
      return jsonError('Registration not found', 404);
    }

    return jsonOk({ ok: true });
  } catch (error: unknown) {
    console.error('Register DELETE error:', error);
    return jsonError('Failed to delete registration', 500);
  }
}
