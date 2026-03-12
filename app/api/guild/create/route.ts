import { NextRequest } from 'next/server';

import { GuildImportService } from '@/lib/services/guild-import';
import { sql } from '@vercel/postgres';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { jsonError, jsonOk, readJsonObject } from '@/lib/api/responses';

export const runtime = 'nodejs';

type CreateGuildBody = {
  name?: unknown;
  swgohGgId?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const body = await readJsonObject<CreateGuildBody>(request);
    if (!body) {
      return jsonError('Request body must be a JSON object', 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const swgohGgId = typeof body.swgohGgId === 'string' ? body.swgohGgId.trim() : '';

    if (!name) {
      return jsonError('Guild name is required', 400);
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const existingSlug = await sql<{ id: string }>`
      SELECT id
      FROM guilds
      WHERE slug = ${slug}
    `;

    const finalSlug =
      existingSlug.rows.length > 0 ? `${slug}-${Date.now().toString(36)}` : slug;

    const guildResult = await sql<{ id: string; name: string; slug: string }>`
      INSERT INTO guilds (id, name, slug, swgoh_gg_id, owner_id)
      VALUES (gen_random_uuid(), ${name}, ${finalSlug}, ${swgohGgId || null}, ${user.id})
      RETURNING id, name, slug
    `;

    const guild = guildResult.rows[0];

    await sql`
      INSERT INTO permissions (id, user_id, guild_id, role, granted_by)
      VALUES (gen_random_uuid(), ${user.id}, ${guild.id}, 'owner', ${user.id})
      ON CONFLICT (user_id, guild_id) DO NOTHING
    `;

    if (swgohGgId) {
      try {
        await GuildImportService.importFromSwgohGG(guild.id, swgohGgId);
      } catch (importError: unknown) {
        console.error('Guild member import failed:', importError);
      }
    }

    return jsonOk({
      guild: {
        id: guild.id,
        name: guild.name,
        slug: guild.slug,
      },
    });
  } catch (error: unknown) {
    console.error('Guild create error:', error);
    return jsonError(
      error instanceof Error ? error.message : 'Guild creation failed',
      500
    );
  }
}
