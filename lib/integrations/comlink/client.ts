import { z } from 'zod';

import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';
import type { ComlinkGuildMember, ComlinkPlayerDetail, ComlinkPlayerProfile, ComlinkRosterUnit, ComlinkUnitMetadata } from './types';

function getBaseUrl(): string {
  const url = process.env.COMLINK_BASE_URL?.trim();
  if (!url) {
    throw new Error('COMLINK_BASE_URL is not configured');
  }
  return url.replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Schemas — derived from confirmed OpenAPI spec v0.38.5
// ---------------------------------------------------------------------------

// Roster unit inside a full POST /player response.
// definitionId  format: "UNITBASEID:SEVEN_STAR" — split on ':' to extract base ID.
// currentRarity = stars (1-7)
// currentTier   = gear tier (1-13, 0 for ships)
// currentLevel  = character level (1-85)
// combatType    = 1 character, 2 ship
// relic.currentTier = raw relic tier (1 = no relic, 3 = R1, ..., 11 = R9)
//   normalized: Math.max(0, currentTier - 2)
//
// NOTE: the field is currentRarity — NOT currentStar.  Using the wrong field name
// silently produces 0 via .catch(0), which then fails validateNormalizedRosterUnit.
const rosterUnitSchema = z
  .object({
    definitionId: z.string().trim().min(1),
    currentRarity: z.coerce.number().int().nonnegative().catch(0),
    currentLevel: z.coerce.number().int().nonnegative().catch(1),
    currentTier: z.coerce.number().int().nonnegative().catch(1),
    combatType: z.coerce.number().int().nonnegative().optional(),
    relic: z
      .object({
        currentTier: z.coerce.number().int().nonnegative().catch(1),
      })
      .nullish(),
  })
  .passthrough();

const playerWithRosterSchema = z
  .object({
    playerId: z.string().trim().min(1),
    allyCode: z.coerce.number().int().nonnegative(),
    name: z.string().trim().min(1).catch('Unknown Player'),
    // z.unknown() per item: one bad unit never silently discards the entire array
    rosterUnit: z.array(z.unknown()).catch([]),
  })
  .passthrough();

const guildMemberSchema = z
  .object({
    // playerId is the stable identity key; allyCode is NOT on this endpoint
    playerId: z.string().trim().min(1),
    playerName: z.string().trim().min(1).catch('Unknown Player'),
    // galacticPower is int64 in the spec; JS number is safe up to 2^53
    galacticPower: z.coerce.number().int().nonnegative().catch(0),
  })
  .passthrough();

const playerResponseSchema = z
  .object({
    playerId: z.string().trim().min(1),
    // allyCode is int64 in the spec; coerce then convert to string for storage
    allyCode: z.coerce.number().int().nonnegative(),
    name: z.string().trim().min(1).catch('Unknown Player'),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Unit metadata schema  POST /data { collection: ['units'] }
// ---------------------------------------------------------------------------

// Each entry in the 'unit' array of the /data response.
// combatType: 1 = character, 2 = ship — always present for playable units.
const unitMetadataSchema = z.object({
  id: z.string().trim().min(1),
  baseId: z.string().trim().min(1),
  combatType: z.coerce.number().int().min(1),
  nameKey: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Normalized roster unit validation  (PART B)
// ---------------------------------------------------------------------------

type UnitValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validates a normalized ComlinkRosterUnit before DB write.
 * Called on Comlink-sourced units only (gearLevel 0–13, never −1 sentinel).
 *
 * Valid ranges after normalization:
 *   rarity    1–7    (0 impossible for an owned unit in SWGOH)
 *   gearLevel 0–13   (0 = ship, 1–13 = character gear tier)
 *   relicTier 0–10    (0 = no relic, 9 = R9; formula Math.max(0, raw-2) bounds this)
 *   level     1-85
 *
 * Ship rule: gearLevel === 0 → relicTier must be 0 (ships have no relic track)
 */
export function validateNormalizedRosterUnit(unit: ComlinkRosterUnit): UnitValidationResult {
  if (!unit.unitBaseId) {
    return { ok: false, reason: 'empty_unit_base_id' };
  }
  if (!Number.isInteger(unit.rarity) || unit.rarity < 1 || unit.rarity > 7) {
    return { ok: false, reason: `rarity_out_of_range:${unit.rarity}` };
  }
  if (!Number.isInteger(unit.gearLevel) || unit.gearLevel < 0 || unit.gearLevel > 13) {
    return { ok: false, reason: `gear_level_out_of_range:${unit.gearLevel}` };
  }
  if (!Number.isInteger(unit.relicTier) || unit.relicTier < 0 || unit.relicTier > 10) {
    return { ok: false, reason: `relic_tier_out_of_range:${unit.relicTier}` };
  }
  if (!Number.isInteger(unit.level) || unit.level < 1 || unit.level > 85) {
    return { ok: false, reason: `level_out_of_range:${unit.level}` };
  }
  // Relics only exist on G13 characters
  if (unit.gearLevel < 13 && unit.relicTier > 0) {
    return { ok: false, reason: `relic_without_g13:${unit.gearLevel}:${unit.relicTier}` };
  }
  // Ships (gearLevel === 0) have no relic track — relicTier must be 0
  if (unit.gearLevel === 0 && unit.relicTier > 0) {
    return { ok: false, reason: `ship_with_relic_tier:${unit.relicTier}` };
  }
  return { ok: true };
}

// Max schema-mismatch log lines emitted per player — prevents log spam when
// the upstream payload shape changes and every unit fails the same check.
const MAX_UNIT_LOG_SAMPLES = 3;

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function postJson(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, enums: false }),
        cache: 'no-store',
      },
      timeoutMs
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Comlink ${path} request timed out`);
    }
    throw new Error(
      `Comlink ${path} request failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  if (!response.ok) {
    // Read the body so the caller can see what Comlink rejected and why.
    const errorBody = await response.text().catch(() => '<unreadable>');
    throw new Error(
      `Comlink ${path} request failed with status ${response.status}: ${errorBody}`
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Readiness probe  GET /readyz
// ---------------------------------------------------------------------------

/**
 * Pings /readyz to check whether the Comlink service is up.
 * Returns true only on HTTP 200; treats any network error or non-200 as not ready.
 */
export async function checkComlinkReady(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${getBaseUrl()}/readyz`,
      { method: 'GET', cache: 'no-store' },
      3000
    );
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unit metadata endpoint  POST /data
// ---------------------------------------------------------------------------

/**
 * Fetches the 'units' collection from Comlink /data and returns a Map keyed
 * by unit.id (the definitionId format, e.g. "SCYTHE:SEVEN_STAR") for O(1)
 * lookup against u.definitionId in the per-player roster payload.
 *
 * combatType in this metadata is authoritative for ship vs character:
 *   1 = character, 2 = ship
 *
 * This must be fetched once per sync batch (not once per player).
 */
export async function fetchComlinkUnitMetadata(): Promise<Map<string, ComlinkUnitMetadata>> {
  // Payload schema confirmed from 400 error body (AJV output):
  //   payload.version   REQUIRED
  //   additionalProperties: false  → no other fields allowed
  //
  // version: '' is the Comlink convention for "return current game data".
  // postJson wraps this as: { payload: { version: '' }, enums: false }
  const requestPayload = { version: '' };
  console.log('[comlink] /data request body:', JSON.stringify({ payload: requestPayload, enums: false }));

  const json = await postJson('/data', requestPayload, 30000);

  const raw = json as Record<string, unknown>;

  // Log every top-level key so the response envelope is visible in logs.
  console.log('[comlink] /data response top-level keys:', Object.keys(raw));

  // Per the OpenAPI spec the collection is keyed 'units' (plural) in the response.
  // 'unit' (singular) is kept as a fallback in case older Comlink builds differ.
  const rawUnits: unknown[] = Array.isArray(raw.units)
    ? (raw.units as unknown[])
    : Array.isArray(raw.unit)
    ? (raw.unit as unknown[])
    : [];

  console.log(`[comlink] /data units raw count: ${rawUnits.length}`);
  if (rawUnits.length > 0) {
    console.log(
      '[comlink] /data first unit sample:',
      JSON.stringify(rawUnits[0]).slice(0, 300)
    );
  }

  if (rawUnits.length === 0) {
    // The response keys log above will show what was actually returned.
    throw new Error(
      `Comlink /data returned no units — response keys: [${Object.keys(raw).join(', ')}]`
    );
  }

  // Key by unit.id — this is the definitionId-format key (e.g. "SCYTHE:SEVEN_STAR")
  // that matches u.definitionId in the per-player roster payload.
  // unitMeta.baseId is the plain DB key (e.g. "SCYTHE").
  const unitsById = new Map<string, ComlinkUnitMetadata>();
  let skipped = 0;
  let firstSkippedSample: string | null = null;

  for (const rawUnit of rawUnits) {
    const parsed = unitMetadataSchema.safeParse(rawUnit);
    if (!parsed.success || !parsed.data.id) {
      if (firstSkippedSample === null) {
        // Log the first failure so we can see actual UnitDef field names if schema is wrong.
        firstSkippedSample = JSON.stringify(rawUnit).slice(0, 300);
      }
      skipped++;
      continue;
    }
    const meta: ComlinkUnitMetadata = {
      id: parsed.data.id,
      baseId: parsed.data.baseId,
      combatType: parsed.data.combatType,
      nameKey: parsed.data.nameKey,
    };
    unitsById.set(meta.id, meta);
  }

  console.log(`[comlink] unit metadata loaded: ${unitsById.size} entries, ${skipped} skipped`);
  if (skipped > 0 && firstSkippedSample !== null) {
    console.warn(`[comlink] /data first skipped UnitDef sample (check field names): ${firstSkippedSample}`);
  }
  return unitsById;
}

// ---------------------------------------------------------------------------
// Guild endpoint  POST /guild
// ---------------------------------------------------------------------------

/**
 * Fetches guild members from Comlink.
 * Returns playerId, playerName, and galacticPower per member.
 * allyCode is NOT present on this endpoint — use fetchComlinkPlayer() for it.
 */
export async function fetchComlinkGuild(guildId: string): Promise<ComlinkGuildMember[]> {
  if (!guildId?.trim()) {
    throw new Error('Missing Comlink guild id');
  }

  const json = await postJson('/guild', { guildId: guildId.trim() }, 20000);

  // Comlink returns either { guild: { member: [...] } } or { member: [...] } depending
  // on the version / configuration. Handle both shapes before touching individual members.
  const raw = json as Record<string, unknown>;
  const guildObj = raw.guild as Record<string, unknown> | undefined;

  const rawMembers: unknown[] = Array.isArray(guildObj?.member)
    ? (guildObj.member as unknown[])
    : Array.isArray(raw.member)
    ? (raw.member as unknown[])
    : [];

  console.log('[comlink] guild response keys:', Object.keys(raw));
  console.log('[comlink] member count:', rawMembers.length);

  if (rawMembers.length === 0) {
    throw new Error('Comlink guild returned no members');
  }

  // Validate each member individually so one bad entry never kills the whole list.
  const valid: ComlinkGuildMember[] = [];

  for (const rawMember of rawMembers) {
    const parsed = guildMemberSchema.safeParse(rawMember);

    if (!parsed.success || !parsed.data.playerId) {
      console.warn('[comlink] skipping guild member with invalid or missing playerId:', rawMember);
      continue;
    }

    valid.push({
      playerId: parsed.data.playerId,
      playerName: parsed.data.playerName,
      galacticPower: parsed.data.galacticPower,
    });
  }

  return valid;
}

// ---------------------------------------------------------------------------
// Player endpoint  POST /player
// ---------------------------------------------------------------------------

/**
 * Fetches a single player profile from Comlink by playerId.
 * Returns playerId, allyCode (as string), and name.
 */
export async function fetchComlinkPlayer(playerId: string): Promise<ComlinkPlayerDetail> {
  if (!playerId?.trim()) {
    throw new Error('Missing Comlink player id');
  }

  const json = await postJson('/player', { playerId: playerId.trim() }, 30000);
  const parsed = playerResponseSchema.safeParse(json);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join('.') ?? 'root';
    throw new Error(
      `Comlink player response was malformed at ${path} for playerId ${playerId}`
    );
  }

  return {
    playerId: parsed.data.playerId,
    allyCode: String(parsed.data.allyCode),
    name: parsed.data.name,
  };
}

// ---------------------------------------------------------------------------
// Player endpoint (full profile)  POST /player
// ---------------------------------------------------------------------------

/**
 * Fetches a full player profile from Comlink including the rosterUnit array.
 * Same endpoint as fetchComlinkPlayer but parses the complete payload.
 * Timeout is slightly higher (35s) to account for larger roster payloads.
 *
 * unitsById — metadata map from fetchComlinkUnitMetadata(), keyed by baseId.
 * Ship vs character classification is driven exclusively from this map
 * (unitMeta.combatType === 2 means ship). The payload's own combatType field
 * is NOT used — it can be absent or unreliable for ship units.
 */
export async function fetchComlinkPlayerWithRoster(
  playerId: string,
  unitsById: Map<string, ComlinkUnitMetadata>
): Promise<ComlinkPlayerProfile> {
  if (!playerId?.trim()) {
    throw new Error('Missing Comlink player id');
  }

  const json = await postJson('/player', { playerId: playerId.trim() }, 35000);

  // PART A — checkpoint 5: raw response top-level keys
  const raw = json as Record<string, unknown>;
  console.log(`[comlink] /player raw keys for ${playerId}:`, Object.keys(raw));

  const rawRosterArray = raw.rosterUnit;
  const rawCount = Array.isArray(rawRosterArray) ? rawRosterArray.length : `not-array (${typeof rawRosterArray})`;
  // PART A — checkpoint 6: raw rosterUnit count
  console.log(`[comlink] /player rosterUnit raw count for ${playerId}:`, rawCount);
  if (Array.isArray(rawRosterArray) && rawRosterArray.length > 0) {
    console.log(
      `[comlink] /player first raw rosterUnit sample for ${playerId}:`,
      JSON.stringify(rawRosterArray[0]).slice(0, 300)
    );
  }

  const parsed = playerWithRosterSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join('.') ?? 'root';
    throw new Error(
      `Comlink player roster response was malformed at ${path} for playerId ${playerId}`
    );
  }

  // Parse each unit individually — one bad item never discards the rest (PART A)
  const rosterUnits: ComlinkRosterUnit[] = [];
  let schemaMismatchCount = 0;
  let emptyBaseIdCount = 0;

  for (const rawItem of parsed.data.rosterUnit) {
    const unitParsed = rosterUnitSchema.safeParse(rawItem);
    if (!unitParsed.success) {
      // Cap log lines per player to avoid log spam when the schema changes globally
      if (schemaMismatchCount < MAX_UNIT_LOG_SAMPLES) {
        const issue = unitParsed.error.issues[0];
        console.warn(
          `[comlink] unit schema mismatch for ${playerId} at ${issue?.path?.join('.') ?? 'root'}:`,
          JSON.stringify(rawItem).slice(0, 150)
        );
      }
      schemaMismatchCount++;
      continue;
    }

    const u = unitParsed.data;

    // Look up metadata by definitionId — the map is keyed by unit.id from /data,
    // which matches the roster payload's definitionId (e.g. "SCYTHE:SEVEN_STAR").
    const unitMeta = unitsById.get(u.definitionId);
    if (!unitMeta) {
      // Unit is not in the /data collection — skip rather than guess its type.
      // Can happen for newly-added units not yet in the metadata, or if the
      // /data collection key format differs from the roster definitionId format.
      console.warn(
        `[comlink] ${playerId} unknown unit skipped: definitionId=${u.definitionId}`
      );
      emptyBaseIdCount++;
      continue;
    }

    // unitMeta.baseId is the plain base ID (e.g. "SCYTHE") used for DB storage.
    const unitBaseId = unitMeta.baseId;

    const rawRelicTier = u.relic?.currentTier ?? 0;

    // combatType from /data metadata is the authoritative ship discriminator.
    // Do NOT use u.combatType from the roster payload — it can be null/absent for ships.
    const isShip = unitMeta.combatType === 2;
    const gearLevel = isShip ? 0 : u.currentTier;
    const relicTier = isShip ? 0 : Math.max(0, rawRelicTier - 2);

    // [roster-normalize] targeted debug for SCYTHE — remove after confirmed clean sync
    if (unitBaseId === 'SCYTHE') {
      console.log(
        `[roster-normalize] SCYTHE player=${playerId}: ` +
        `definitionId=${u.definitionId} ` +
        `payloadCombatType=${u.combatType ?? null} metaCombatType=${unitMeta.combatType} ` +
        `currentTier=${u.currentTier} relic.currentTier=${u.relic?.currentTier ?? null} ` +
        `classified=${isShip ? 'SHIP' : 'CHARACTER'} ` +
        `gearLevel=${gearLevel} relicTier=${relicTier}`
      );
    }

    // Log raw source fields for the first successfully-parsed unit per player so
    // the mapping can be verified in logs without reading the full payload.
    if (rosterUnits.length === 0) {
      console.log(
        `[comlink] ${playerId} raw sample: ` +
        `definitionId=${u.definitionId} baseId=${unitBaseId} ` +
        `currentRarity=${u.currentRarity} currentLevel=${u.currentLevel} ` +
        `currentTier=${u.currentTier} relic.currentTier=${u.relic?.currentTier ?? null} ` +
        `payloadCombatType=${u.combatType ?? null} metaCombatType=${unitMeta.combatType} isShip=${isShip}`
      );
    }

    rosterUnits.push({
      unitBaseId,
      rarity: u.currentRarity,
      level: u.currentLevel,
      gearLevel,
      relicTier,
    });
  }

  if (schemaMismatchCount > MAX_UNIT_LOG_SAMPLES) {
    console.warn(
      `[comlink] ${schemaMismatchCount - MAX_UNIT_LOG_SAMPLES} additional schema mismatches suppressed for ${playerId} (${schemaMismatchCount} total)`
    );
  }

  const totalSkipped = schemaMismatchCount + emptyBaseIdCount;
  console.log(
    `[comlink] ${playerId}: parsed=${rosterUnits.length} skipped=${totalSkipped}` +
    (schemaMismatchCount > 0 ? ` schema_mismatch=${schemaMismatchCount}` : '') +
    (emptyBaseIdCount > 0 ? ` empty_base_id=${emptyBaseIdCount}` : '')
  );
  if (rosterUnits.length > 0) {
    console.log(`[comlink] first normalized unit for ${playerId}:`, rosterUnits[0]);
  }

  return {
    playerId: parsed.data.playerId,
    allyCode: String(parsed.data.allyCode),
    name: parsed.data.name,
    rosterUnits,
  };
}
