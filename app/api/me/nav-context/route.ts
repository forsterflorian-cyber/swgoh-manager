import { sql } from '@vercel/postgres';

import { getAuthenticatedUser, getDiscordUserIdForUser } from '@/lib/api/auth';
import { getPrimaryGuildSettingsForUser, isGuildManagerRole } from '@/lib/services/guild-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const [guildSettings, discordUserId] = await Promise.all([
      getPrimaryGuildSettingsForUser(user.id),
      getDiscordUserIdForUser(user.id),
    ]);

    // Admin guild (from permissions)
    const adminGuild = guildSettings
      ? {
          name: guildSettings.name,
          slug: guildSettings.slug,
          canManageGuild: isGuildManagerRole(guildSettings.role),
        }
      : null;

    // Member registration guild (from registered_members)
    let memberGuild: { name: string; slug: string } | null = null;
    if (discordUserId) {
      const reg = await sql<{ guild_name: string; guild_slug: string }>`
        SELECT g.name AS guild_name, g.slug AS guild_slug
        FROM registered_members rm
        JOIN guilds g ON g.id = rm.guild_id
        WHERE rm.discord_user_id = ${discordUserId}
        LIMIT 1
      `;
      if (reg.rows.length > 0) {
        memberGuild = {
          name: reg.rows[0].guild_name,
          slug: reg.rows[0].guild_slug,
        };
      }
    }

    return jsonOk({ adminGuild, memberGuild });
  } catch (error: unknown) {
    console.error('nav-context error:', error);
    return jsonError('Failed to load nav context', 500);
  }
}
