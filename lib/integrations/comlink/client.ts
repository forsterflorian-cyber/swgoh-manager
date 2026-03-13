import { z } from 'zod';

import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';
import type { ComlinkGuildMember, ComlinkPlayerDetail, ComlinkPlayerProfile, ComlinkRosterUnit } from './types';

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
// definitionId format: "UNITBASEID:SEVEN_STAR" — split on ':' to extract base ID.
// currentStar  = stars (1-7, integer field, not an enum)
// currentTier  = gear tier (1-13, 0 for ships)
// currentLevel = character level (1-85)
// relic.currentTier = raw relic tier (1 = no relic, 3 = R1, ..., 11 = R9)
//   normalized: Math.max(0, currentTier - 2)
const rosterUnitSchema = z
  .object({
    definitionId: z.string().trim().min(1),
    currentLevel: z.coerce.number().int().nonnegative().catch(1),
    currentTier: z.coerce.number().int().nonnegative().catch(1),
    currentStar: z.coerce.number().int().nonnegative().catch(0),
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
    rosterUnit: z.array(rosterUnitSchema).catch([]),
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
    throw new Error(`Comlink ${path} request failed with status ${response.status}`);
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
 */
export async function fetchComlinkPlayerWithRoster(
  playerId: string
): Promise<ComlinkPlayerProfile> {
  if (!playerId?.trim()) {
    throw new Error('Missing Comlink player id');
  }

  const json = await postJson('/player', { playerId: playerId.trim() }, 35000);
  const parsed = playerWithRosterSchema.safeParse(json);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join('.') ?? 'root';
    throw new Error(
      `Comlink player roster response was malformed at ${path} for playerId ${playerId}`
    );
  }

  const rosterUnits: ComlinkRosterUnit[] = [];

  for (const raw of parsed.data.rosterUnit) {
    const parts = raw.definitionId.split(':');
    const unitBaseId = parts[0];
    if (!unitBaseId) continue;

    const rawRelicTier = raw.relic?.currentTier ?? 1;
    rosterUnits.push({
      unitBaseId,
      rarity: raw.currentStar,
      level: raw.currentLevel,
      gearLevel: raw.currentTier,
      relicTier: Math.max(0, rawRelicTier - 2),
    });
  }

  return {
    playerId: parsed.data.playerId,
    allyCode: String(parsed.data.allyCode),
    name: parsed.data.name,
    rosterUnits,
  };
}
