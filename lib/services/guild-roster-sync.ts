import { db } from '@vercel/postgres';

import {
  checkComlinkReady,
  fetchComlinkPlayerWithRoster,
} from '@/lib/integrations/comlink/client';
import type { ComlinkPlayerProfile } from '@/lib/integrations/comlink/types';

// ---------------------------------------------------------------------------
// Readiness — mirrors the pattern in guild-sync.ts
// ---------------------------------------------------------------------------

const READINESS_MAX_RETRIES = 5;
const READINESS_RETRY_DELAY_MS = 1000;

async function waitForComlink(): Promise<void> {
  console.log('[roster-sync] Readiness probe started');

  for (let attempt = 0; attempt <= READINESS_MAX_RETRIES; attempt++) {
    if (await checkComlinkReady()) {
      console.log('[roster-sync] Readiness probe succeeded');
      return;
    }

    if (attempt < READINESS_MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, READINESS_RETRY_DELAY_MS));
    }
  }

  console.warn('[roster-sync] Readiness probe timed out after all retries');
  throw new Error('Comlink service is waking up or unavailable');
}

// ---------------------------------------------------------------------------
// Transient error detection — same rules as guild-sync.ts
// ---------------------------------------------------------------------------

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes('timed out') ||
    msg.includes('request failed:') ||
    msg.includes('status 5')
  );
}

// ---------------------------------------------------------------------------
// Concurrency pool — same pattern as guild-sync.ts
// ---------------------------------------------------------------------------

// Lower than guild-sync (3) because full roster payloads are large
const ROSTER_CONCURRENCY = 2;
const ROSTER_MAX_RETRIES = 2;
const ROSTER_RETRY_DELAY_MS = 3000;

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
// Guild roster sync
// ---------------------------------------------------------------------------

export type GuildRosterSyncResult = {
  guildId: string;
  membersConsidered: number;
  membersSkipped: number;
  membersFetched: number;
  totalRosterRows: number;
  totalUpserts: number;       // rows actually committed to DB
  totalUpsertErrors: number;  // members whose transaction was rolled back
};

type GuildMemberRow = {
  player_id: string;
  player_name: string;
};

/**
 * Syncs roster data for all guild members into the player_roster table.
 *
 * Source: guild_members rows with a non-null player_id.
 * Comlink POST /player returns the full profile including rosterUnit[].
 * Each unit is upserted via (guild_id, player_id, unit_base_id) — idempotent.
 */
export async function syncGuildRosters(guildId: string): Promise<GuildRosterSyncResult> {
  console.log(`[roster-sync] Started for guild ${guildId}`);

  const client = await db.connect();

  try {
    // 1. Load guild members that have a stable player_id
    const membersResult = await client.sql<GuildMemberRow>`
      SELECT player_id, player_name
      FROM guild_members
      WHERE guild_id = ${guildId}
        AND player_id IS NOT NULL
      ORDER BY player_name
    `;

    const members = membersResult.rows;
    // PART A — checkpoint 1+2
    console.log(
      `[roster-sync] Members considered for roster sync: ${members.length} (guild ${guildId})`
    );
    if (members.length > 0) {
      console.log(`[roster-sync] First eligible member sample:`, members[0]);
    }

    if (members.length === 0) {
      console.log(
        `[roster-sync] No members with player_id found for guild ${guildId} — run guild member sync first`
      );
      return {
        guildId,
        membersConsidered: 0,
        membersSkipped: 0,
        membersFetched: 0,
        totalRosterRows: 0,
        totalUpserts: 0,
      };
    }

    // 2. Wait for Comlink (handles Render cold starts)
    await waitForComlink();

    // 3. Fetch full player profile (with rosterUnit[]) for each member
    let timeouts = 0;
    let retried = 0;

    const fetchResults = await runConcurrent(
      members,
      async (m) => {
        let lastError: unknown;
        for (let attempt = 0; attempt <= ROSTER_MAX_RETRIES; attempt++) {
          try {
            return await fetchComlinkPlayerWithRoster(m.player_id);
          } catch (error: unknown) {
            lastError = error;
            if (!isTransientError(error) || attempt === ROSTER_MAX_RETRIES) {
              throw error;
            }
            if (error instanceof Error && error.message.includes('timed out')) {
              timeouts++;
            }
            retried++;
            await new Promise((resolve) => setTimeout(resolve, ROSTER_RETRY_DELAY_MS));
          }
        }
        throw lastError;
      },
      ROSTER_CONCURRENCY
    );

    console.log(`[roster-sync] Fetch timeouts: ${timeouts}, retried after transient error: ${retried}`);

    // 4. Collect successful fetch results
    const profiles: ComlinkPlayerProfile[] = [];
    let membersSkipped = 0;

    for (let i = 0; i < members.length; i++) {
      const result = fetchResults[i];

      if (result?.status === 'fulfilled') {
        const profile = result.value;
        profiles.push(profile);
        console.log(
          `[roster-sync] Fetched ${profile.rosterUnits.length} units for ${members[i].player_name} (${members[i].player_id})`
        );
      } else {
        const reason =
          result?.status === 'rejected'
            ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
            : 'missing result';
        console.warn(
          `[roster-sync] Skipping ${members[i].player_name} (${members[i].player_id}): ${reason}`
        );
        membersSkipped++;
      }
    }

    const membersFetched = profiles.length;
    const totalRosterRows = profiles.reduce((sum, p) => sum + p.rosterUnits.length, 0);
    console.log(
      `[roster-sync] Successfully fetched ${membersFetched} profiles — ${totalRosterRows} total roster rows to upsert`
    );

    // 5. Upsert roster rows per member in individual transactions.
    //    Committing per member means a failure mid-way leaves already-synced members intact.
    //    Re-running is safe because the upsert is idempotent.
    //    totalUpserts counts rows in *committed* transactions only (not rolled back ones).
    let totalUpserts = 0;
    let totalUpsertErrors = 0;

    for (const profile of profiles) {
      if (profile.rosterUnits.length === 0) {
        console.warn(
          `[roster-sync] Profile for ${profile.playerId} (${profile.name}) has 0 roster units — skipping upsert`
        );
        continue;
      }

      // PART A — checkpoint 9: upsert attempt count per member
      console.log(
        `[roster-sync] Upserting ${profile.rosterUnits.length} units for player ${profile.playerId} (${profile.name})`
      );

      await client.sql`BEGIN`;
      let memberUpserts = 0;
      try {
        for (const unit of profile.rosterUnits) {
          await client.sql`
            INSERT INTO player_roster (
              id, guild_id, player_id, unit_base_id,
              rarity, level, gear_level, relic_tier, last_synced
            )
            VALUES (
              gen_random_uuid(),
              ${guildId},
              ${profile.playerId},
              ${unit.unitBaseId},
              ${unit.rarity},
              ${unit.level},
              ${unit.gearLevel},
              ${unit.relicTier},
              NOW()
            )
            ON CONFLICT (guild_id, player_id, unit_base_id)
            DO UPDATE SET
              rarity      = EXCLUDED.rarity,
              level       = EXCLUDED.level,
              gear_level  = EXCLUDED.gear_level,
              relic_tier  = EXCLUDED.relic_tier,
              last_synced = NOW()
          `;
          memberUpserts++;
        }
        await client.sql`COMMIT`;
        // Only count after successful COMMIT
        totalUpserts += memberUpserts;
        console.log(
          `[roster-sync] Committed ${memberUpserts} rows for player ${profile.playerId}`
        );
      } catch (error) {
        await client.sql`ROLLBACK`;
        totalUpsertErrors++;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(
          `[roster-sync] Upsert FAILED for player ${profile.playerId} (${profile.name}) — rolled back: ${msg}`
        );
        // Table-not-found is a hard failure — no point processing remaining members
        if (msg.includes('does not exist')) {
          throw new Error(`player_roster table not found — run migration 008_player_roster.sql: ${msg}`);
        }
      }
    }

    if (totalUpsertErrors > 0) {
      console.warn(
        `[roster-sync] ${totalUpsertErrors} member(s) had upsert errors out of ${membersFetched} fetched`
      );
    }

    console.log(
      `[roster-sync] Finished for guild ${guildId}: ` +
        `membersConsidered=${members.length} ` +
        `membersSkipped=${membersSkipped} ` +
        `membersFetched=${membersFetched} ` +
        `totalRosterRows=${totalRosterRows} ` +
        `totalUpserts=${totalUpserts} ` +
        `totalUpsertErrors=${totalUpsertErrors}`
    );

    return {
      guildId,
      membersConsidered: members.length,
      membersSkipped,
      membersFetched,
      totalRosterRows,
      totalUpserts,
      totalUpsertErrors,
    };
  } finally {
    client.release();
  }
}
