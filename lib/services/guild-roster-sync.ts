import { db, sql } from '@vercel/postgres';

import {
  checkComlinkReady,
  fetchComlinkPlayerWithRoster,
  validateNormalizedRosterUnit,
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

/** Classify a fetch/parse error into a short label for structured logs (PART C) */
function categorizeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const msg = error.message;
  if (msg.includes('timed out')) return 'timeout';
  if (msg.includes('malformed')) return 'parse_failure';
  if (msg.includes('status 5')) return 'server_error';
  if (msg.includes('request failed')) return 'network_error';
  return 'other';
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
  totalEligibleMembers: number; // all members with player_id across the whole guild
  membersConsidered: number;    // members in this batch (after offset/limit)
  membersSkipped: number;       // fetch failures (timeout / parse / network)
  membersFetched: number;
  membersWithZeroUnits: number; // fetched but 0 valid units after parse+validation
  totalRosterRows: number;      // raw unit count from Comlink (pre-validation)
  totalRejectedUnits: number;   // units that passed parse but failed validateNormalizedRosterUnit
  totalUpserts: number;         // rows actually committed to DB
  totalUpsertErrors: number;    // members whose transaction was rolled back
};

type GuildMemberRow = {
  player_id: string;
  player_name: string;
};

// ---------------------------------------------------------------------------
// Post-sync sanity check  (PART E)
// ---------------------------------------------------------------------------

/**
 * Runs lightweight sanity queries after a sync batch to surface obviously-wrong data.
 * Non-fatal: logs warnings but never throws.
 *
 * What it checks:
 *   - Total rows and distinct members in player_roster for this guild
 *   - Rarity distribution anomalies (rarity=0, rarity>7)
 *   - Out-of-range relic tiers (relic_tier > 9)
 *   - Min/max relic tier and ship count
 *   - Members with suspiciously few roster rows (<50 heuristic)
 */
async function runPostSyncSanityCheck(guildId: string): Promise<void> {
  // Uses sql directly (no transaction needed — read-only diagnostic queries)
  try {
    const summary = await sql<{
      distinct_members: number;
      total_rows: number;
      rarity_zero: number;
      rarity_invalid: number;
      relic_tier_invalid: number;
      min_relic: number;
      max_relic: number;
      ship_count: number;
    }>`
      SELECT
        COUNT(DISTINCT player_id)::int                   AS distinct_members,
        COUNT(*)::int                                    AS total_rows,
        COUNT(*) FILTER (WHERE rarity = 0)::int          AS rarity_zero,
        COUNT(*) FILTER (WHERE rarity > 7)::int          AS rarity_invalid,
        COUNT(*) FILTER (WHERE relic_tier > 9)::int      AS relic_tier_invalid,
        COALESCE(MIN(relic_tier), 0)                     AS min_relic,
        COALESCE(MAX(relic_tier), 0)                     AS max_relic,
        COUNT(*) FILTER (WHERE gear_level = 0)::int      AS ship_count
      FROM player_roster
      WHERE guild_id = ${guildId}
    `;

    const s = summary.rows[0];
    if (!s) return;

    console.log(
      `[roster-sync] post-sync sanity guild=${guildId}: ` +
      `distinct_members=${s.distinct_members} total_rows=${s.total_rows} ` +
      `ships=${s.ship_count} min_relic=${s.min_relic} max_relic=${s.max_relic}`
    );

    if (s.rarity_zero > 0 || s.rarity_invalid > 0 || s.relic_tier_invalid > 0) {
      console.warn(
        `[roster-sync] suspicious values in player_roster: ` +
        `rarity_zero=${s.rarity_zero} rarity_invalid=${s.rarity_invalid} relic_tier_invalid=${s.relic_tier_invalid}`
      );
    }

    // Members with very few rows — heuristic: <50 is likely a partial sync or a fresh account
    const thinMembers = await sql<{ player_id: string; row_count: number }>`
      SELECT player_id, COUNT(*)::int AS row_count
      FROM player_roster
      WHERE guild_id = ${guildId}
      GROUP BY player_id
      HAVING COUNT(*) < 50
      ORDER BY row_count ASC
      LIMIT 5
    `;

    if (thinMembers.rows.length > 0) {
      console.warn(
        `[roster-sync] members with thin rosters (<50 units): ` +
        thinMembers.rows.map((r) => `${r.player_id}:${r.row_count}`).join(', ')
      );
    }
  } catch (error) {
    // Sanity check is diagnostic-only; never fail the sync because of it
    console.warn(
      '[roster-sync] post-sync sanity check failed (non-fatal):',
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Syncs roster data for a batch of guild members into the player_roster table.
 *
 * Source: guild_members rows with a non-null player_id.
 * Comlink POST /player returns the full profile including rosterUnit[].
 * Each unit is upserted via (guild_id, player_id, unit_base_id) — idempotent.
 *
 * offset/limit slice the eligible member list so callers can process in batches
 * to stay within serverless request timeouts. Omitting both processes everything.
 */
export async function syncGuildRosters(
  guildId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<GuildRosterSyncResult> {
  const batchOffset = Math.max(0, options.offset ?? 0);
  const batchLimit = options.limit ?? Infinity;

  console.log(`[roster-sync] Started for guild ${guildId} offset=${batchOffset} limit=${batchLimit}`);

  const client = await db.connect();

  try {
    // DB fingerprint — proves which database and dataset the runtime is actually using
    const fp = await client.sql<{ db_name: string; member_count: number }>`
      SELECT current_database() AS db_name,
             (SELECT COUNT(*)::int FROM guild_members) AS member_count
    `;
    console.log(
      `[roster-sync] database fingerprint: db=${fp.rows[0]?.db_name} total_guild_members=${fp.rows[0]?.member_count}`
    );

    // 1. Load guild members that have a stable player_id
    const membersResult = await client.sql<GuildMemberRow>`
      SELECT player_id, player_name
      FROM guild_members
      WHERE guild_id = ${guildId}
        AND player_id IS NOT NULL
      ORDER BY player_name
    `;

    const allMembers = membersResult.rows;
    const totalEligibleMembers = allMembers.length;
    console.log(`[roster-sync] eligible members: ${totalEligibleMembers}`);

    if (totalEligibleMembers === 0) {
      console.log(
        `[roster-sync] No members with player_id found for guild ${guildId} — run guild member sync first`
      );
      return {
        guildId,
        totalEligibleMembers: 0,
        membersConsidered: 0,
        membersSkipped: 0,
        membersFetched: 0,
        membersWithZeroUnits: 0,
        totalRosterRows: 0,
        totalRejectedUnits: 0,
        totalUpserts: 0,
        totalUpsertErrors: 0,
      };
    }

    // Slice to the requested batch
    const members = allMembers.slice(
      batchOffset,
      batchLimit === Infinity ? undefined : batchOffset + batchLimit
    );
    console.log(
      `[roster-sync] batch: offset=${batchOffset} limit=${batchLimit} size=${members.length}`
    );
    if (members.length > 0) {
      console.log(`[roster-sync] first eligible member:`, members[0]);
    }

    if (members.length === 0) {
      // offset is past the end — caller asked for a range beyond available members
      return {
        guildId,
        totalEligibleMembers,
        membersConsidered: 0,
        membersSkipped: 0,
        membersFetched: 0,
        membersWithZeroUnits: 0,
        totalRosterRows: 0,
        totalRejectedUnits: 0,
        totalUpserts: 0,
        totalUpsertErrors: 0,
      };
    }

    // 2. Wait for Comlink (handles Render cold starts)
    await waitForComlink();

    // 3. Fetch full player profile (with rosterUnit[]) for each member in the batch
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

    // 4. Collect successful fetch results; categorize failures for diagnosability (PART C)
    const profiles: ComlinkPlayerProfile[] = [];
    let membersSkipped = 0;

    for (let i = 0; i < members.length; i++) {
      const result = fetchResults[i];

      if (result?.status === 'fulfilled') {
        const profile = result.value;
        profiles.push(profile);
        console.log(
          `[roster-sync] fetch_ok player=${members[i].player_id} name=${members[i].player_name} raw_units=${profile.rosterUnits.length}`
        );
      } else {
        const error = result?.status === 'rejected' ? result.reason : undefined;
        const category = categorizeFetchError(error);
        const msg = error instanceof Error ? error.message : String(error ?? 'missing result');
        console.warn(
          `[roster-sync] fetch_fail category=${category} player=${members[i].player_id} name=${members[i].player_name}: ${msg}`
        );
        membersSkipped++;
      }
    }

    const membersFetched = profiles.length;
    const totalRosterRows = profiles.reduce((sum, p) => sum + p.rosterUnits.length, 0);
    console.log(
      `[roster-sync] Successfully fetched ${membersFetched} profiles — ${totalRosterRows} total roster rows to upsert`
    );

    // 5. Validate normalized units and upsert per member in individual transactions.
    //    Validation (PART B): rejects units with out-of-range values before any DB write.
    //    Committing per member means a failure mid-way leaves already-synced members intact.
    //    Re-running is safe because the upsert is idempotent.
    //    totalUpserts counts rows in *committed* transactions only (not rolled back ones).
    let totalUpserts = 0;
    let totalUpsertErrors = 0;
    let totalRejectedUnits = 0;
    let membersWithZeroUnits = 0;

    for (const profile of profiles) {
      // ---- PART B: validate each normalized unit before DB write ----
      const validUnits = [];
      const rejectionBuckets: Record<string, number> = {};

      for (const unit of profile.rosterUnits) {
        const validation = validateNormalizedRosterUnit(unit);

        // [roster-validate] targeted debug for SCYTHE — remove after confirmed clean sync
        if (unit.unitBaseId === 'SCYTHE') {
          console.log(
            `[roster-validate] SCYTHE player=${profile.playerId}: ` +
            `gearLevel=${unit.gearLevel} relicTier=${unit.relicTier} ` +
            `rarity=${unit.rarity} level=${unit.level} ` +
            `valid=${validation.ok}` +
            (!validation.ok ? ` reason=${validation.reason}` : '')
          );
        }

        if (!validation.ok) {
          const bucket = validation.reason.split(':')[0]; // e.g. "rarity_out_of_range"
          rejectionBuckets[bucket] = (rejectionBuckets[bucket] ?? 0) + 1;
        } else {
          validUnits.push(unit);
        }
      }

      const rejectedCount = profile.rosterUnits.length - validUnits.length;
      totalRejectedUnits += rejectedCount;

      if (rejectedCount > 0) {
        // Log one sample of the rejected units to aid debugging
        const sampleUnit = profile.rosterUnits.find(
          (u) => !validateNormalizedRosterUnit(u).ok
        );
        console.warn(
          `[roster-sync] validation_rejected player=${profile.playerId} count=${rejectedCount} buckets=${JSON.stringify(rejectionBuckets)} sample=${JSON.stringify(sampleUnit)}`
        );
      }

      if (validUnits.length === 0) {
        membersWithZeroUnits++;
        console.warn(
          `[roster-sync] zero_valid_units player=${profile.playerId} name=${profile.name} raw=${profile.rosterUnits.length} rejected=${rejectedCount} — skipping upsert`
        );
        continue;
      }
      // ---------------------------------------------------------------

      const playerStartMs = Date.now();
      await client.sql`BEGIN`;
      let memberUpserts = 0;
      try {
        for (const unit of validUnits) {
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
        // Only count after successful COMMIT (PART C)
        totalUpserts += memberUpserts;
        console.log(
          `[roster-sync] commit_ok player=${profile.playerId} rows=${memberUpserts} rejected=${rejectedCount} duration_ms=${Date.now() - playerStartMs}`
        );
      } catch (error) {
        await client.sql`ROLLBACK`;
        totalUpsertErrors++;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(
          `[roster-sync] db_write_fail player=${profile.playerId} name=${profile.name} — rolled back: ${msg}`
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

    // ---- PART E: post-sync sanity check ----
    await runPostSyncSanityCheck(guildId);
    // ----------------------------------------

    console.log(
      `[roster-sync] run_complete guild=${guildId} ` +
        `totalEligible=${totalEligibleMembers} offset=${batchOffset} ` +
        `considered=${members.length} skipped=${membersSkipped} fetched=${membersFetched} ` +
        `zeroUnits=${membersWithZeroUnits} rawRows=${totalRosterRows} ` +
        `rejected=${totalRejectedUnits} upserts=${totalUpserts} errors=${totalUpsertErrors}`
    );

    return {
      guildId,
      totalEligibleMembers,
      membersConsidered: members.length,
      membersSkipped,
      membersFetched,
      membersWithZeroUnits,
      totalRosterRows,
      totalRejectedUnits,
      totalUpserts,
      totalUpsertErrors,
    };
  } finally {
    client.release();
  }
}
