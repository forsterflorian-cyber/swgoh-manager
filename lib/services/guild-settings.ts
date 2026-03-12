import { sql } from '@vercel/postgres';

export type GuildAccessRole = 'owner' | 'admin' | 'officer' | 'member';

export type GuildSettingsRecord = {
  id: string;
  name: string;
  slug: string;
  guildId: string | null;
  role: GuildAccessRole;
};

type GuildSettingsRow = {
  id: string;
  name: string;
  slug: string;
  swgoh_gg_id: string | null;
  role: GuildAccessRole;
};

const GUILD_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isGuildManagerRole(role: GuildAccessRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'officer';
}

export function isValidGuildSlug(slug: string): boolean {
  return GUILD_SLUG_PATTERN.test(slug);
}

export async function getPrimaryGuildSettingsForUser(
  userId: string
): Promise<GuildSettingsRecord | null> {
  const result = await sql<GuildSettingsRow>`
    SELECT
      g.id,
      g.name,
      g.slug,
      g.swgoh_gg_id,
      p.role::text AS role
    FROM permissions p
    JOIN guilds g ON g.id = p.guild_id
    WHERE p.user_id = ${userId}
    ORDER BY
      CASE p.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'officer' THEN 2
        ELSE 3
      END,
      g.created_at ASC
    LIMIT 1
  `;

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    guildId: row.swgoh_gg_id,
    role: row.role,
  };
}

type UpdateGuildSettingsInput = {
  guildDbId: string;
  guildId: string;
  slug: string;
};

type UpdateGuildSettingsResult =
  | {
      success: true;
      guildId: string;
      slug: string;
    }
  | {
      success: false;
      error: string;
      status: number;
    };

export async function updateGuildSettings({
  guildDbId,
  guildId,
  slug,
}: UpdateGuildSettingsInput): Promise<UpdateGuildSettingsResult> {
  const guildIdConflict = await sql<{ id: string }>`
    SELECT id
    FROM guilds
    WHERE swgoh_gg_id = ${guildId}
      AND id <> ${guildDbId}
    LIMIT 1
  `;

  if (guildIdConflict.rows.length > 0) {
    return {
      success: false,
      error: 'Guild ID is already in use.',
      status: 409,
    };
  }

  const slugConflict = await sql<{ id: string }>`
    SELECT id
    FROM guilds
    WHERE slug = ${slug}
      AND id <> ${guildDbId}
    LIMIT 1
  `;

  if (slugConflict.rows.length > 0) {
    return {
      success: false,
      error: 'Guild slug is already in use.',
      status: 409,
    };
  }

  const result = await sql<{ swgoh_gg_id: string; slug: string }>`
    UPDATE guilds
    SET swgoh_gg_id = ${guildId},
        slug = ${slug},
        updated_at = NOW()
    WHERE id = ${guildDbId}
    RETURNING swgoh_gg_id, slug
  `;

  const row = result.rows[0];
  if (!row) {
    return {
      success: false,
      error: 'Guild not found.',
      status: 404,
    };
  }

  return {
    success: true,
    guildId: row.swgoh_gg_id,
    slug: row.slug,
  };
}
