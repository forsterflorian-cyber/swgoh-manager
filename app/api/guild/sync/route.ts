import { getAuthenticatedUser, userCanManageGuild } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getPrimaryGuildSettingsForUser } from '@/lib/services/guild-settings';
import { syncGuildMembers } from '@/lib/services/guild-sync';

export const runtime = 'nodejs';

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return jsonError('Not authenticated', 401);
  }

  const guild = await getPrimaryGuildSettingsForUser(user.id);
  if (!guild) {
    return jsonError('Guild not found', 404);
  }

  if (!(await userCanManageGuild(user.id, guild.id))) {
    return jsonError('Not authorized', 403);
  }

  if (!guild.guildId?.trim()) {
    return jsonError('Guild external ID is not configured', 400);
  }

  try {
    const result = await syncGuildMembers(guild.id);

    return jsonOk({
      success: true,
      guildId: result.guildId,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Guild sync failed';

    if (message === 'Guild external ID is not configured') {
      return jsonError(message, 400);
    }

    if (message === 'Guild not found') {
      return jsonError(message, 404);
    }

    if (message === 'Comlink service is waking up or unavailable') {
      return jsonError(message, 503);
    }

    console.error('[api/guild/sync] Guild sync failed:', error);
    return jsonError('Guild sync failed', 500);
  }
}
