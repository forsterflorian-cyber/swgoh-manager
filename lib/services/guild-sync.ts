import { db } from '@vercel/postgres';

import {
  checkComlinkReady,
  fetchComlinkGuild,
  fetchComlinkPlayer,
} from '@/lib/integrations/comlink/client';
import type { ComlinkMember, ComlinkPlayerDetail } from '@/lib/integrations/comlink/types';

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
// Player-fetch configuration
// ---------------------------------------------------------------------------

const PLAYER_CONCURRENCY = 3; // conservative for Render free-tier cold starts
const PLAYER_MAX_RETRIES = 2;
const PLAYER_RETRY_DELAY_MS = 2000;

/**
 * Returns true for transient failures that are worth retrying:
 *   - request timeouts (AbortError / "timed out")
 *   - network-level errors ("request failed:")
 *   - 5xx HTTP errors ("status 5")
 * Does NOT retry 4xx or schema/validation failures.
 */
function isTransientPlayerError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes('timed out') ||
    msg.includes('request failed:') ||
    msg.includes('status 5')
  );
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
  deleted: number;
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

    console.log('[sync] parsed guild members:', guildMembers.length);

    // 4. Resolve allyCode for each member via POST /player
    //    Concurrency is capped at PLAYER_CONCURRENCY (3) to avoid overwhelming
    //    the Render free-tier service on cold starts. Each call is retried up to
    //    PLAYER_MAX_RETRIES times for transient failures (timeout / network / 5xx).
    let timeouts = 0;
    let retried = 0;

    const playerResults = await runConcurrent(
      guildMembers,
      async (m) => {
        let lastError: unknown;
        for (let attempt = 0; attempt <= PLAYER_MAX_RETRIES; attempt++) {
          try {
            return await fetchComlinkPlayer(m.playerId);
          } catch (error: unknown) {
            lastError = error;
            if (!isTransientPlayerError(error) || attempt === PLAYER_MAX_RETRIES) {
              throw error;
            }
            if (error instanceof Error && error.message.includes('timed out')) {
              timeouts++;
            }
            retried++;
            await new Promise((resolve) => setTimeout(resolve, PLAYER_RETRY_DELAY_MS));
          }
        }
        throw lastError;
      },
      PLAYER_CONCURRENCY
    );

    console.log(`[sync] player fetch timeouts: ${timeouts}`);
    console.log(`[sync] resolved after retry: ${retried}`);

    // Collect successful /player responses into a flat array.
    // Using an explicit loop with a null-guard so an unfilled results slot
    // (undefined) never throws on .status access.
    const resolvedPlayers: ComlinkPlayerDetail[] = [];
    let skipped = 0;

    for (let i = 0; i < guildMembers.length; i++) {
      const result = playerResults[i];

      if (result?.status === 'fulfilled') {
        resolvedPlayers.push(result.value);
      } else {
        const reason =
          result?.status === 'rejected'
            ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
            : 'missing result';
        console.warn(
          `[guild-sync] Skipping ${guildMembers[i].playerName} (${guildMembers[i].playerId}): ${reason}`
        );
        skipped++;
      }
    }

    console.log('[sync] resolved player details:', resolvedPlayers.length);

    // 5. Merge by playerId — Map-based, fully index-independent.
    // galacticPower comes from the guild response; allyCode + name come from /player.
    const playerById = new Map(resolvedPlayers.map((p) => [p.playerId, p]));

    const members: ComlinkMember[] = guildMembers.flatMap((gm) => {
      const player = playerById.get(gm.playerId);
      if (!player?.allyCode) return [];
      return [{
        playerId: gm.playerId,
        playerName: player.name || gm.playerName || 'Unknown Player',
        allyCode: player.allyCode,
        galacticPower: gm.galacticPower ?? 0,
      }];
    });

    console.log('[sync] merged members:', members.length);
    if (members[0]) {
      console.log('[sync] merged sample:', members[0]);
    }

    // 6. Upsert all resolved members in a single transaction.
    // The unique key is (guild_id, player_id) — not ally_code.
    // xmax = 0 on the returned row means it was freshly inserted; non-zero means updated.
    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    const authoritativePlayerIds = guildMembers
      .map((m) => m.playerId?.trim())
      .filter((id): id is string => Boolean(id));

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
      if (authoritativePlayerIds.length === 0) {
        throw new Error('Guild sync returned zero members; aborting cleanup for safety');
      }
      // Cleanup stale guild members:
      // Membership truth comes from the guild endpoint, not from resolved player details.
      const existingMembersResult = await client.sql<{ player_id: string }>`
        SELECT player_id
        FROM guild_members
        WHERE guild_id = ${guildId}
      `;

      const authoritativeSet = new Set(authoritativePlayerIds);
      const stalePlayerIds = existingMembersResult.rows
        .map((row) => row.player_id)
        .filter((playerId) => !authoritativeSet.has(playerId));

      for (const stalePlayerId of stalePlayerIds) {
        await client.sql`
          DELETE FROM guild_members
          WHERE guild_id = ${guildId}
            AND player_id = ${stalePlayerId}
        `;
        deleted++;
      }

      await client.sql`COMMIT`;
    } catch (error) {
      await client.sql`ROLLBACK`;
      throw error;
    }

    console.log(
      `[guild-sync] Finished for guild ${guildId}: inserted=${inserted} updated=${updated} skipped=${skipped} deleted=${deleted}`
    );

    return { guildId, inserted, updated, skipped, deleted };
  } finally {
    client.release();
  }
}
