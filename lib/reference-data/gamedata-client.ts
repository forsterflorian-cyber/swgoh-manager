import { z } from 'zod';

import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout';

const allVersionsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

const territoryBattleZoneSchema = z
  .object({
    forceAlignment: z.coerce.number().int().nullish(),
    zoneDefinition: z
      .object({
        zoneId: z.string().trim().min(1).nullish(),
        nameKey: z.string().trim().nullish(),
        linkedConflictId: z.string().trim().nullish(),
      })
      .passthrough(),
  })
  .passthrough();

 const territoryBattleDefinitionEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    nameKey: z.string().trim().nullish(),
    roundCount: z.coerce.number().int().positive().nullish(),
    territoryCategory: z.string().trim().nullish(),
    forceAlignment: z.coerce.number().int().nullish(),
    conflictZoneDefinition: z.array(territoryBattleZoneSchema).catch([]),
  })
  .passthrough();

const territoryBattleDefinitionSchema = z
  .object({
    version: z.string().trim().nullish(),
    data: z.array(territoryBattleDefinitionEntrySchema).catch([]),
  })
  .passthrough();

const roteUnitSchema = z
  .object({
    unitIdentifier: z.string().trim().nullish(),
    baseId: z.string().trim().nullish(),
    nameKey: z.string().trim().nullish(),
    rarity: z.coerce.number().int().nullish(),
    unitRelicTier: z.coerce.number().int().nullish(),
  })
  .passthrough();

const rotePlatoonSchema = z
  .object({
    id: z.string().trim().nullish(),
    units: z.array(roteUnitSchema).catch([]),
  })
  .passthrough();

const roteOperationSchema = z
  .object({
    id: z.string().trim().min(1),
    phase: z.string().trim().min(1),
    conflict: z.string().trim().nullish(),
    linkedConflictId: z.string().trim().nullish(),
    nameKey: z.string().trim().nullish(),
    sort: z.coerce.number().int().nullish(),
    squads: z.array(rotePlatoonSchema).catch([]),
  })
  .passthrough();

const roteOperationsSchema = z.array(roteOperationSchema);

export type AllVersionsRecord = z.infer<typeof allVersionsSchema>;
export type TerritoryBattleDefinitionEntry = z.infer<typeof territoryBattleDefinitionEntrySchema>;
export type TerritoryBattleDefinitionPayload = z.infer<typeof territoryBattleDefinitionSchema>;
export type RoteOperation = z.infer<typeof roteOperationSchema>;
export type RoteOperationsPayload = z.infer<typeof roteOperationsSchema>;

export type AllVersionsPayload = {
  raw: AllVersionsRecord;
  gameVersion: string | null;
  territoryBattleDefinitionVersion: string | null;
  roteOperationsVersion: string | null;
};

async function fetchJson<T>(url: string, schema: z.ZodType<T>, label: string): Promise<T> {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      url,
      {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      },
      15000
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${label} request timed out`);
    }

    throw new Error(
      `${label} request failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  if (!response.ok) {
    throw new Error(`${label} request failed with ${response.status}`);
  }

  const json = (await response.json()) as unknown;
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join('.') || 'root';
    throw new Error(`${label} payload was invalid at ${path}`);
  }

  return parsed.data;
}

function readVersion(record: AllVersionsRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function fetchAllVersions(): Promise<AllVersionsPayload> {
  const raw = await fetchJson(
    'https://raw.githubusercontent.com/swgoh-utils/gamedata/main/allVersions.json',
    allVersionsSchema,
    'allVersions.json'
  );

  return {
    raw,
    gameVersion: readVersion(raw, 'gameVersion'),
    territoryBattleDefinitionVersion: readVersion(raw, 'territoryBattleDefinition.json'),
    // swgoh_rote_operations.json is not versioned separately in allVersions.json today.
    roteOperationsVersion: readVersion(raw, 'swgoh_rote_operations.json'),
  };
}

export async function fetchTerritoryBattleDefinition(): Promise<TerritoryBattleDefinitionPayload> {
  const payload = await fetchJson(
    'https://raw.githubusercontent.com/swgoh-utils/gamedata/main/territoryBattleDefinition.json',
    territoryBattleDefinitionSchema,
    'territoryBattleDefinition.json'
  );

  if (payload.data.length === 0) {
    throw new Error('territoryBattleDefinition.json did not contain any Territory Battle entries');
  }

  return payload;
}

export async function fetchRoteOperations(): Promise<RoteOperationsPayload> {
  const payload = await fetchJson(
    'https://raw.githubusercontent.com/swgoh-utils/gamedata/main/swgoh_rote_operations.json',
    roteOperationsSchema,
    'swgoh_rote_operations.json'
  );

  if (payload.length === 0) {
    throw new Error('swgoh_rote_operations.json did not contain any ROTE operations');
  }

  return payload;
}
