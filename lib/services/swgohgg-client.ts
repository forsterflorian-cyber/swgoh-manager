import { z } from 'zod';

import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';

const swgohHeaders: HeadersInit = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

const guildMemberSchema = z
  .object({
    player_name: z.string().trim().min(1).catch('Unknown Player'),
    ally_code: z.union([z.string(), z.number()]).transform((value) => String(value)),
    galactic_power: z.coerce.number().int().nonnegative().catch(0),
  })
  .passthrough();

const guildProfileSchema = z
  .object({
    data: z
      .object({
        members: z.array(guildMemberSchema).catch([]),
      })
      .catch({ members: [] }),
  })
  .passthrough();

const playerUnitSchema = z
  .object({
    data: z
      .object({
        base_id: z.string().trim().min(1),
        name: z.string().trim().nullish(),
        rarity: z.coerce.number().int().nullish(),
        gear_level: z.coerce.number().int().nullish(),
        relic_tier: z.coerce.number().int().nullish(),
        power: z.coerce.number().int().nullish(),
        galactic_power: z.coerce.number().int().nullish(),
        is_galactic_legend: z.boolean().nullish(),
        zeta_abilities: z.array(z.unknown()).nullish(),
        omicron_abilities: z.array(z.unknown()).nullish(),
      })
      .passthrough(),
  })
  .passthrough();

const playerProfileSchema = z
  .object({
    units: z.array(playerUnitSchema).catch([]),
  })
  .passthrough();

export type SwgohGuildMember = z.infer<typeof guildMemberSchema>;
export type SwgohPlayerUnit = z.infer<typeof playerUnitSchema>['data'];

async function fetchJson<T>(url: string, schema: z.ZodType<T>, label: string): Promise<T> {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      url,
      {
        cache: 'no-store',
        headers: swgohHeaders,
      },
      15000
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`SWGOH.GG ${label} request timed out`);
    }

    throw new Error(
      `SWGOH.GG ${label} request failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  if (!response.ok) {
    throw new Error(`SWGOH.GG ${label} request failed with ${response.status}`);
  }

  const json = (await response.json()) as unknown;
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join('.') || 'root';
    throw new Error(`SWGOH.GG ${label} payload was invalid at ${path}`);
  }

  return parsed.data;
}

export async function fetchGuildMembers(swgohGgGuildId: string): Promise<SwgohGuildMember[]> {
  if (!swgohGgGuildId?.trim()) {
    throw new Error('Missing SWGOH.GG guild id');
  }

  const payload = await fetchJson(
    `https://swgoh.gg/api/guild-profile/${swgohGgGuildId.trim()}/`,
    guildProfileSchema,
    'guild profile'
  );

  if (payload.data.members.length === 0) {
    throw new Error('SWGOH.GG guild profile returned no members');
  }

  return payload.data.members;
}

export async function fetchPlayerRoster(allyCode: string): Promise<SwgohPlayerUnit[]> {
  const normalizedAllyCode = allyCode.replace(/\D/g, '');

  if (!normalizedAllyCode) {
    throw new Error('Missing ally code');
  }

  const payload = await fetchJson(
    `https://swgoh.gg/api/player/${normalizedAllyCode}/`,
    playerProfileSchema,
    'player roster'
  );

  if (payload.units.length === 0) {
    throw new Error(`SWGOH.GG player roster returned no units for ${normalizedAllyCode}`);
  }

  return payload.units.map((unit) => unit.data);
}
