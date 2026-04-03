import { NextRequest } from 'next/server';

import { sql } from '@vercel/postgres';
import { getAuthenticatedUser, userCanManageGuild } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const { guildId } = await params;

    if (!(await userCanManageGuild(user.id, guildId))) {
      return jsonError('Forbidden', 403);
    }

    const result = await sql`
      SELECT
        rm.id,
        rm.discord_user_id,
        rm.ally_code,
        rm.guild_member_id,
        rm.status,
        rm.registered_at,
        rm.updated_at,
        gm.player_name,
        gm.galactic_power
      FROM registered_members rm
      JOIN guild_members gm ON gm.id = rm.guild_member_id
      WHERE rm.guild_id = ${guildId}
      ORDER BY gm.player_name ASC
    `;

    return jsonOk({ registrations: result.rows });
  } catch (error: unknown) {
    console.error('Registered members GET error:', error);
    return jsonError('Failed to load registered members', 500);
  }
}
