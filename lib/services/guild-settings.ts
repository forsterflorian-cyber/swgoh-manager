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

export type GuildMemberRow = {
  id: string;
  playerName: string;
  allyCode: string | null;
  galacticPower: number;
  ignoredAt: string | null;
};

type GuildMemberDbRow = {
  id: string;
  player_name: string;
  ally_code: string | null;
  galactic_power: number;
  ignored_at: string | null;
};

export async function getGuildMemberList(guildDbId: string): Promise<GuildMemberRow[]> {
  const result = await sql<GuildMemberDbRow>`
    SELECT id, player_name, ally_code, galactic_power, ignored_at::text
    FROM guild_members
    WHERE guild_id = ${guildDbId}
    ORDER BY 
      CASE WHEN ignored_at IS NULL THEN 0 ELSE 1 END,
      galactic_power DESC
  `;

  return result.rows.map((row) => ({
    id: row.id,
    playerName: row.player_name,
    allyCode: row.ally_code,
    galacticPower: row.galactic_power,
    ignoredAt: row.ignored_at,
  }));
}

export type RosterSyncStats = {
  totalMembersEligible: number;
  membersSynced: number;
  totalRosterRows: number;
  lastSyncedAt: Date | null;
};

type RosterSyncStatsRow = {
  total_eligible: number;
  members_synced: number;
  total_rows: number;
  last_synced_at: Date | null;
};

export async function getRosterSyncStats(guildDbId: string): Promise<RosterSyncStats> {
  try {
    const result = await sql<RosterSyncStatsRow>`
      SELECT
        (SELECT COUNT(*)::int FROM guild_members
         WHERE guild_id = ${guildDbId} AND player_id IS NOT NULL) AS total_eligible,
        COUNT(DISTINCT pr.player_id)::int AS members_synced,
        COUNT(pr.id)::int                AS total_rows,
        MAX(pr.last_synced)              AS last_synced_at
      FROM player_roster pr
      WHERE pr.guild_id = ${guildDbId}
    `;
    const row = result.rows[0];
    return {
      totalMembersEligible: row?.total_eligible ?? 0,
      membersSynced: row?.members_synced ?? 0,
      totalRosterRows: row?.total_rows ?? 0,
      lastSyncedAt: row?.last_synced_at ?? null,
    };
  } catch {
    // player_roster table may not exist yet if migration hasn't run
    return { totalMembersEligible: 0, membersSynced: 0, totalRosterRows: 0, lastSyncedAt: null };
  }
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
type ConnectOrUpdateGuildSettingsInput = {
  userId: string;
  guildId: string;
  slug: string;
};

type ConnectOrUpdateGuildSettingsResult =
  | {
      success: true;
      guildDbId: string;
      guildId: string;
      slug: string;
      created: boolean;
    }
  | {
      success: false;
      error: string;
      status: number;
    };

export async function connectOrUpdateGuildSettings({
  userId,
  guildId,
  slug,
}: ConnectOrUpdateGuildSettingsInput): Promise<ConnectOrUpdateGuildSettingsResult> {
  const existingGuildForUser = await getPrimaryGuildSettingsForUser(userId);

  if (existingGuildForUser) {
    const updated = await updateGuildSettings({
      guildDbId: existingGuildForUser.id,
      guildId,
      slug,
    });

    if (!updated.success) {
      return updated;
    }

    await sql`
      UPDATE users
      SET guild_id = ${existingGuildForUser.id}
      WHERE id = ${userId}
    `;

    return {
      success: true,
      guildDbId: existingGuildForUser.id,
      guildId: updated.guildId,
      slug: updated.slug,
      created: false,
    };
  }

  const guildIdConflict = await sql<{ id: string }>`
    SELECT id
    FROM guilds
    WHERE swgoh_gg_id = ${guildId}
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
    LIMIT 1
  `;

  if (slugConflict.rows.length > 0) {
    return {
      success: false,
      error: 'Guild slug is already in use.',
      status: 409,
    };
  }

const createdGuild = await sql<{ id: string; swgoh_gg_id: string; slug: string }>`
  INSERT INTO guilds (name, slug, swgoh_gg_id, owner_id)
  VALUES (${slug}, ${slug}, ${guildId}, ${userId})
  RETURNING id, swgoh_gg_id, slug
`;

  const row = createdGuild.rows[0];

  if (!row) {
    return {
      success: false,
      error: 'Guild could not be created.',
      status: 500,
    };
  }

  await sql`
    INSERT INTO permissions (user_id, guild_id, role)
    VALUES (${userId}, ${row.id}, 'owner')
  `;

  await sql`
    UPDATE users
    SET guild_id = ${row.id}
    WHERE id = ${userId}
  `;

  return {
    success: true,
    guildDbId: row.id,
    guildId: row.swgoh_gg_id,
    slug: row.slug,
    created: true,
  };
}