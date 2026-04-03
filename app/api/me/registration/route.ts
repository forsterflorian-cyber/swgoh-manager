import { sql } from '@vercel/postgres';
import { getAuthenticatedUser, getDiscordUserIdForUser } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const discordUserId = await getDiscordUserIdForUser(user.id);
    if (!discordUserId) {
      return jsonOk({ registration: null });
    }

    const result = await sql<{
      guild_id: string;
      ally_code: string;
      guild_name: string;
      guild_slug: string;
    }>`
      SELECT rm.guild_id, rm.ally_code, g.name AS guild_name, g.slug AS guild_slug
      FROM registered_members rm
      JOIN guilds g ON g.id = rm.guild_id
      WHERE rm.discord_user_id = ${discordUserId}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return jsonOk({ registration: null });
    }

    const row = result.rows[0];
    return jsonOk({
      registration: {
        guildId: row.guild_id,
        allyCode: row.ally_code,
        guildName: row.guild_name,
        guildSlug: row.guild_slug,
      },
    });
  } catch (error: unknown) {
    console.error('me/registration GET error:', error);
    return jsonError('Failed to fetch registration', 500);
  }
}
