import { NextRequest } from 'next/server';
import { sql } from '@vercel/postgres';
import { getAuthenticatedUser, userCanAccessGuild } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const user = await getAuthenticatedUser();

    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    if (!(await userCanAccessGuild(user.id, guildId))) {
      return jsonError('Forbidden', 403);
    }

    const membersResult = await sql`
      SELECT id, player_name, ally_code, galactic_power, last_synced
      FROM guild_members
      WHERE guild_id = ${guildId}
      ORDER BY galactic_power DESC
    `;

    return jsonOk({
      members: membersResult.rows,
    });
  } catch (error: unknown) {
    console.error('Members API error:', error);
    return jsonError(
      error instanceof Error ? error.message : 'Failed to load guild members',
      500
    );
  }
}
