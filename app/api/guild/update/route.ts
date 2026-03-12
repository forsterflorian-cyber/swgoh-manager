import { NextRequest } from 'next/server';

import { getAuthenticatedUser } from '@/lib/api/auth';
import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';
import {
  getPrimaryGuildSettingsForUser,
  isGuildManagerRole,
  isValidGuildSlug,
  updateGuildSettings,
} from '@/lib/services/guild-settings';

export const runtime = 'nodejs';

type UpdateGuildBody = {
  guildId?: unknown;
  slug?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const body = await readJsonObject<UpdateGuildBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const guildId = typeof body.guildId === 'string' ? body.guildId.trim() : '';
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';

    if (!guildId) {
      return jsonError('Guild ID is required', 400);
    }

    if (!slug) {
      return jsonError('Guild slug is required', 400);
    }

    if (!isValidGuildSlug(slug)) {
      return jsonError('Guild slug must use lowercase letters, numbers, and hyphens only', 400);
    }

    const guild = await getPrimaryGuildSettingsForUser(user.id);
    if (!guild) {
      return jsonError('Guild not found', 404);
    }

    if (!isGuildManagerRole(guild.role)) {
      return jsonError('Forbidden', 403);
    }

    const result = await updateGuildSettings({
      guildDbId: guild.id,
      guildId,
      slug,
    });

    if (!result.success) {
      return jsonError(result.error, result.status);
    }

    return jsonOk({
      guildId: result.guildId,
      slug: result.slug,
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Guild settings update failed',
      500
    );
  }
}
