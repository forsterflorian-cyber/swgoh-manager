import { db } from '@vercel/postgres';

import {
  checkComlinkReady,
  fetchComlinkGuild,
  fetchComlinkPlayer,
} from '@/lib/integrations/comlink/client';
import type { ComlinkMember } from '@/lib/integrations/comlink/types';

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Concurrency pool
//
// Runs fn over all items with at most `concurrency` in-flight at once.
// Individual failures are captured as rejected results rather than aborting
// the whole batch — so one bad player fetch doesn't lose everyone else.
// ---------------------------------------------------------------------------

async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (error) {
        results[i] = { status: 'rejected', reason: error };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// Guild sync
// ---------------------------------------------------------------------------

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
    // 1. Load local guild and require the external Comlink guild id
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

    // 2. Wait for Comlink (handles Render cold starts)
    await waitForComlink();

    // 3. Fetch guild member list — returns playerId + playerName + galacticPower
    console.log(`[guild-sync] Fetching guild members from Comlink for guild ${guildId}`);
    let guildMembers;
    try {
      guildMembers = await fetchComlinkGuild(externalId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown upstream error';
      console.error(`[guild-sync] Upstream guild fetch failed for guild ${guildId}: ${message}`);
      throw new Error(`Guild sync failed: ${message}`);
    }

    console.log(
      `[guild-sync] Fetched ${guildMembers.length} members from Comlink; resolving player details`
    );

    // 4. Resolve allyCode for each member via POST /player (concurrent, max 8 in-flight)
    const playerResults = await runConcurrent(
      guildMembers,
      (m) => fetchComlinkPlayer(m.playerId),
      8
    );

    // 5. Merge guild member data with player details
    const members: ComlinkMember[] = [];
    let skipped = 0;

    for (let i = 0; i < guildMembers.length; i++) {
      const gm = guildMembers[i];
      const result = playerResults[i];

      if (result.status === 'rejected') {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.warn(
          `[guild-sync] Skipping member ${gm.playerName} (${gm.playerId}): player fetch failed — ${reason}`
        );
        skipped++;
        continue;
      }

      members.push({
        playerId: gm.playerId,
        playerName: gm.playerName,
        allyCode: result.value.allyCode,
        galacticPower: gm.galacticPower,
      });
    }

    console.log(
      `[guild-sync] Player details resolved: ${members.length} ready, ${skipped} skipped`
    );

    // 6. Upsert all resolved members in a single transaction.
    // The unique key is (guild_id, player_id) — not ally_code.
    // xmax = 0 on the returned row means it was freshly inserted; non-zero means updated.
    let inserted = 0;
    let updated = 0;

    await client.sql`BEGIN`;

    try {
      for (const member of members) {
        const result = await client.sql<{ is_insert: boolean }>`
          INSERT INTO guild_members (
            id, guild_id, player_id, player_name, ally_code,
            galactic_power, last_synced, created_at, updated_at
          )
          VALUES (
            gen_random_uuid(),
            ${guildId},
            ${member.playerId},
            ${member.playerName},
            ${member.allyCode},
            ${member.galacticPower},
            NOW(), NOW(), NOW()
          )
          ON CONFLICT (guild_id, player_id)
          DO UPDATE SET
            player_name    = EXCLUDED.player_name,
            ally_code      = EXCLUDED.ally_code,
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
