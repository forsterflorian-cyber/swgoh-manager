import { z } from 'zod';

import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';
import type { ComlinkGuildMember } from './types';

// Comlink member contribution type 2 = Galactic Power
const GALACTIC_POWER_TYPE = 2;

function getBaseUrl(): string {
  const url = process.env.COMLINK_BASE_URL?.trim();
  if (!url) {
    throw new Error('COMLINK_BASE_URL is not configured');
  }
  return url.replace(/\/$/, '');
}

const memberContributionSchema = z
  .object({
    type: z.number(),
    currentValue: z.string(),
  })
  .passthrough();

const rawMemberSchema = z
  .object({
    playerName: z.string().trim().min(1).catch('Unknown Player'),
    allyCode: z.coerce.number().int().nonnegative().catch(0),
    memberContribution: z.array(memberContributionSchema).optional().default([]),
  })
  .passthrough();

const guildResponseSchema = z
  .object({
    guild: z
      .object({
        profile: z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .passthrough(),
        member: z.array(rawMemberSchema).catch([]),
      })
      .passthrough(),
  })
  .passthrough();

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

export async function fetchComlinkGuild(guildId: string): Promise<ComlinkGuildMember[]> {
  if (!guildId?.trim()) {
    throw new Error('Missing Comlink guild id');
  }

  const url = `${getBaseUrl()}/guild`;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { guildId: guildId.trim() }, enums: false }),
        cache: 'no-store',
      },
      20000
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Comlink guild request timed out');
    }
    throw new Error(
      `Comlink guild request failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  if (!response.ok) {
    throw new Error(`Comlink guild request failed with status ${response.status}`);
  }

  const json = (await response.json()) as unknown;

  // Diagnostic: log the first raw member before Zod parsing to verify actual field names.
  // Remove once the schema is confirmed correct.
  const rawMemberList = (json as { guild?: { member?: unknown[] } } | null)?.guild?.member;
  console.log(
    '[comlink] guild member sample:',
    JSON.stringify(Array.isArray(rawMemberList) ? rawMemberList[0] : rawMemberList, null, 2)
  );

  const parsed = guildResponseSchema.safeParse(json);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join('.') ?? 'root';
    throw new Error(`Comlink guild response was malformed at ${path}`);
  }

  const members = parsed.data.guild.member;

  if (members.length === 0) {
    throw new Error('Comlink guild returned no members');
  }

  const mapped: ComlinkGuildMember[] = [];

  for (const m of members) {
    // allyCode === 0 means the field was absent or unparseable (Zod .catch(0) fired).
    // Skip these — writing "0" as the ally code causes all members to collide on the
    // same UNIQUE(guild_id, ally_code) key.
    if (m.allyCode === 0) {
      console.warn('[comlink] skipping member with missing or unparseable ally code:', m.playerName);
      continue;
    }

    const gpEntry = m.memberContribution?.find((c) => c.type === GALACTIC_POWER_TYPE);
    const galacticPower = gpEntry ? (parseInt(gpEntry.currentValue, 10) || 0) : 0;

    mapped.push({
      playerName: m.playerName,
      allyCode: String(m.allyCode),
      galacticPower,
    });
  }

  return mapped;
}
