import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';
import {
  connectOrUpdateGuildSettings,
  isValidGuildSlug,
  getPrimaryGuildSettingsForUser,
  isGuildManagerRole
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

const existingGuild = await getPrimaryGuildSettingsForUser(user.id);

if (existingGuild && !isGuildManagerRole(existingGuild.role)) {
  return jsonError('Forbidden', 403);
}

const result = await connectOrUpdateGuildSettings({
  userId: user.id,
  guildId,
  slug,
});

if (!result.success) {
  return jsonError(result.error, result.status);
}

return NextResponse.json({
  ok: true,
  data: {
    guildId: result.guildId,
    slug: result.slug,
    created: result.created,
  },
});
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Guild settings update failed',
      500
    );
  }
}
