import { db } from '@vercel/postgres';

import { checkComlinkReady, fetchComlinkGuild } from '@/lib/integrations/comlink/client';

const READINESS_MAX_RETRIES = 5;
const READINESS_RETRY_DELAY_MS = 1000;

async function waitForComlink(): Promise<void> {
  console.log('[guild-sync] Readiness probe started');

  for (let attempt = 0; attempt <= READINESS_MAX_RETRIES; attempt++) {
    if (await checkComlinkReady()) {
      console.log('[guild-sync] Readiness probe succeeded');
      return;
    }

    if (attempt < READINESS_MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, READINESS_RETRY_DELAY_MS));
    }
  }

  console.warn('[guild-sync] Readiness probe timed out after all retries');
  throw new Error('Comlink service is waking up or unavailable');
}

export type GuildSyncResult = {
  guildId: string;
  inserted: number;
  updated: number;
  skipped: number;
};

export async function syncGuildMembers(guildId: string): Promise<GuildSyncResult> {
  console.log(`[guild-sync] Started for guild ${guildId}`);

  const client = await db.connect();

  try {
    // 1. Load local guild and require swgoh_gg_id (used as Comlink external guild id)
    const guildResult = await client.sql<{ swgoh_gg_id: string | null }>`
      SELECT swgoh_gg_id
      FROM guilds
      WHERE id = ${guildId}
      LIMIT 1
    `;

    const guild = guildResult.rows[0];
    if (!guild) {
      throw new Error('Guild not found');
    }

    const externalId = guild.swgoh_gg_id?.trim();
    if (!externalId) {
      throw new Error('Guild external ID is not configured');
    }

    // 2. Wait for Comlink to be ready (handles Render cold starts)
    await waitForComlink();

    // 3. Fetch members from Comlink
    console.log(`[guild-sync] Fetching guild members from Comlink for guild ${guildId}`);
    let members;
    try {
      members = await fetchComlinkGuild(externalId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown upstream error';
      console.error(`[guild-sync] Upstream Comlink failure for guild ${guildId}: ${message}`);
      throw new Error(`Guild sync failed: ${message}`);
    }

    console.log(`[guild-sync] Fetched ${members.length} members from Comlink for guild ${guildId}`);

    // 4. Upsert all members in a single transaction
    // xmax = 0 means the row was freshly inserted; non-zero means it was updated.
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    await client.sql`BEGIN`;

    try {
      for (const member of members) {
        // Defence-in-depth: the client already filters these, but guard again so a
        // bad ally code can never corrupt the UNIQUE(guild_id, ally_code) key.
        if (!member.allyCode || member.allyCode === '0') {
          console.warn(`[guild-sync] skipping member with no ally code: ${member.playerName}`);
          skipped++;
          continue;
        }

        const result = await client.sql<{ is_insert: boolean }>`
          INSERT INTO guild_members (id, guild_id, player_name, ally_code, galactic_power, last_synced, created_at, updated_at)
          VALUES (
            gen_random_uuid(),
            ${guildId},
            ${member.playerName},
            ${member.allyCode},
            ${member.galacticPower},
            NOW(),
            NOW(),
            NOW()
          )
          ON CONFLICT (guild_id, ally_code)
          DO UPDATE SET
            player_name    = EXCLUDED.player_name,
            galactic_power = EXCLUDED.galactic_power,
            last_synced    = NOW(),
            updated_at     = NOW()
          RETURNING (xmax = 0) AS is_insert
        `;

        if (result.rows[0]?.is_insert) {
          inserted++;
        } else {
          updated++;
        }
      }

      await client.sql`COMMIT`;
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    }

    console.log(
      `[guild-sync] Finished for guild ${guildId}: inserted=${inserted} updated=${updated} skipped=${skipped}`
    );

    return { guildId, inserted, updated, skipped };
  } finally {
    client.release();
  }
}
