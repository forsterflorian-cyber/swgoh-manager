import { sql } from '@vercel/postgres';
import type { VercelPoolClient } from '@vercel/postgres';

import { toNumber } from '@/lib/utils/to-number';
import {
  fetchAllVersions,
  fetchRoteOperations,
  fetchTerritoryBattleDefinition,
} from './gamedata-client.ts';
import {
  normalizeRoteDefinition,
  type NormalizedTbDefinition,
} from './tb-normalize.ts';

type ImportableTbKey = 'rote';

type StoredVersionRow = {
  source_name: string;
  source_version: string | null;
};

type ReferenceCounts = {
  phases: number;
  zones: number;
  platoons: number;
  slots: number;
};

export type TbImportResult = {
  tbKey: ImportableTbKey;
  tbName: string;
  skipped: boolean;
  forced: boolean;
  sourceVersion: string | null;
  sourceVersions: Record<string, string | null>;
  counts: ReferenceCounts;
};

type VersionMap = Record<string, string | null>;

const SOURCE_NAME = 'swgoh-utils/gamedata';
const TERRITORY_BATTLE_SOURCE = 'territoryBattleDefinition.json';
const ROTE_OPERATIONS_SOURCE = 'swgoh_rote_operations.json';
const DELETE_TARGETS = {
  tb_platoon_slots: { parentColumn: 'tb_platoon_id', keyColumn: 'slot_key' },
  tb_platoons: { parentColumn: 'tb_zone_id', keyColumn: 'platoon_key' },
  tb_zones: { parentColumn: 'tb_phase_id', keyColumn: 'zone_key' },
} as const;

function getNormalizedCounts(definition: NormalizedTbDefinition): ReferenceCounts {
  const phases = definition.phases.length;
  const zones = definition.phases.reduce((count, phase) => count + phase.zones.length, 0);
  const platoons = definition.phases.reduce(
    (count, phase) =>
      count +
      phase.zones.reduce((zoneCount, zone) => zoneCount + zone.platoons.length, 0),
    0
  );
  const slots = definition.phases.reduce(
    (count, phase) =>
      count +
      phase.zones.reduce(
        (zoneCount, zone) =>
          zoneCount +
          zone.platoons.reduce(
            (platoonCount, platoon) => platoonCount + platoon.slots.length,
            0
          ),
        0
      ),
    0
  );

  return { phases, zones, platoons, slots };
}

async function getStoredVersions(sourceNames: string[]): Promise<VersionMap> {
  if (sourceNames.length === 0) {
    return {};
  }

  const result = await sql.query<StoredVersionRow>(
    'SELECT source_name, source_version FROM tb_reference_versions WHERE source_name = ANY($1::text[])',
    [sourceNames]
  );

  return result.rows.reduce<VersionMap>((accumulator, row) => {
    accumulator[row.source_name] = row.source_version;
    return accumulator;
  }, {});
}

async function getStoredCounts(tbKey: ImportableTbKey): Promise<ReferenceCounts> {
  const result = await sql<{
    phase_count: string | number;
    zone_count: string | number;
    platoon_count: string | number;
    slot_count: string | number;
  }>`
    SELECT
      COUNT(DISTINCT tp.id) AS phase_count,
      COUNT(DISTINCT tz.id) AS zone_count,
      COUNT(DISTINCT tpl.id) AS platoon_count,
      COUNT(DISTINCT tps.id) AS slot_count
    FROM tb_definitions td
    LEFT JOIN tb_phases tp ON tp.tb_definition_id = td.id
    LEFT JOIN tb_zones tz ON tz.tb_phase_id = tp.id
    LEFT JOIN tb_platoons tpl ON tpl.tb_zone_id = tz.id
    LEFT JOIN tb_platoon_slots tps ON tps.tb_platoon_id = tpl.id
    WHERE td.tb_key = ${tbKey}
  `;

  const row = result.rows[0];

  return {
    phases: toNumber(row?.phase_count),
    zones: toNumber(row?.zone_count),
    platoons: toNumber(row?.platoon_count),
    slots: toNumber(row?.slot_count),
  };
}

async function deleteByKeys(
  tableName: keyof typeof DELETE_TARGETS,
  parentId: string,
  keys: string[],
  client: VercelPoolClient
): Promise<void> {
  const target = DELETE_TARGETS[tableName];

  if (keys.length === 0) {
    await client.query(`DELETE FROM ${tableName} WHERE ${target.parentColumn} = $1`, [parentId]);
    return;
  }

  await client.query(
    `DELETE FROM ${tableName} WHERE ${target.parentColumn} = $1 AND NOT (${target.keyColumn} = ANY($2::text[]))`,
    [parentId, keys]
  );
}

function validateNormalizedDefinition(definition: NormalizedTbDefinition): ReferenceCounts {
  const counts = getNormalizedCounts(definition);

  if (definition.phases.length === 0 || counts.zones === 0 || counts.platoons === 0 || counts.slots === 0) {
    throw new Error('Normalized TB definition was empty and was not written to the database');
  }

  return counts;
}

async function upsertDefinition(
  definition: NormalizedTbDefinition,
  client: VercelPoolClient
): Promise<string> {
  const result = await client.sql<{ id: string }>`
    INSERT INTO tb_definitions (
      id,
      tb_key,
      short_code,
      name,
      source,
      source_version,
      total_phases,
      is_active,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      ${definition.tbKey},
      ${definition.tbKey.toUpperCase()},
      ${definition.tbName},
      ${SOURCE_NAME},
      ${definition.sourceVersion},
      ${definition.totalPhases},
      true,
      NOW()
    )
    ON CONFLICT (tb_key)
    DO UPDATE SET
      short_code = EXCLUDED.short_code,
      name = EXCLUDED.name,
      source = EXCLUDED.source,
      source_version = EXCLUDED.source_version,
      total_phases = EXCLUDED.total_phases,
      is_active = true,
      updated_at = NOW()
    RETURNING id
  `;

  return result.rows[0].id;
}

async function upsertNormalizedDefinition(
  definition: NormalizedTbDefinition,
  sourceVersions: VersionMap
): Promise<void> {
  const client = (await sql.connect()) as VercelPoolClient;

  try {
    await client.query('BEGIN');

    const tbDefinitionId = await upsertDefinition(definition, client);

    for (const phase of definition.phases) {
      const phaseResult = await client.sql<{ id: string }>`
        INSERT INTO tb_phases (id, tb_definition_id, phase_number, updated_at)
        VALUES (gen_random_uuid(), ${tbDefinitionId}, ${phase.phaseNumber}, NOW())
        ON CONFLICT (tb_definition_id, phase_number)
        DO UPDATE SET updated_at = NOW()
        RETURNING id
      `;

      const phaseId = phaseResult.rows[0].id;

      for (const zone of phase.zones) {
        const zoneResult = await client.sql<{ id: string }>`
          INSERT INTO tb_zones (id, tb_phase_id, zone_key, name, sort_order, is_bonus, planet_category, updated_at)
          VALUES (
            gen_random_uuid(),
            ${phaseId},
            ${zone.zoneKey},
            ${zone.zoneName},
            ${zone.sortOrder},
            ${zone.isBonus},
            ${zone.isBonus ? 'SPECIAL' : zone.category},
            NOW()
          )
          ON CONFLICT (tb_phase_id, zone_key)
          DO UPDATE SET
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order,
            is_bonus = EXCLUDED.is_bonus,
            planet_category = excluded.planet_category,
            updated_at = NOW()
          RETURNING id
        `;

        const zoneId = zoneResult.rows[0].id;

        for (const platoon of zone.platoons) {
          const platoonResult = await client.sql<{ id: string }>`
            INSERT INTO tb_platoons (
              id,
              tb_zone_id,
              platoon_key,
              platoon_number,
              sort_order,
              updated_at
            ) VALUES (
              gen_random_uuid(),
              ${zoneId},
              ${platoon.platoonKey},
              ${platoon.platoonNumber},
              ${platoon.sortOrder},
              NOW()
            )
            ON CONFLICT (tb_zone_id, platoon_key)
            DO UPDATE SET
              platoon_number = EXCLUDED.platoon_number,
              sort_order = EXCLUDED.sort_order,
              updated_at = NOW()
            RETURNING id
          `;

          const platoonId = platoonResult.rows[0].id;

          for (const slot of platoon.slots) {
            await client.sql`
              INSERT INTO tb_platoon_slots (
                id,
                tb_platoon_id,
                slot_key,
                slot_number,
                unit_base_id,
                unit_name,
                required_rarity,
                required_relic_tier,
                updated_at
              ) VALUES (
                gen_random_uuid(),
                ${platoonId},
                ${slot.slotKey},
                ${slot.slotNumber},
                ${slot.unitBaseId},
                ${slot.unitName ?? null},
                ${slot.rarity ?? null},
                ${slot.relicTier ?? null},
                NOW()
              )
              ON CONFLICT (tb_platoon_id, slot_key)
              DO UPDATE SET
                slot_number = EXCLUDED.slot_number,
                unit_base_id = EXCLUDED.unit_base_id,
                unit_name = EXCLUDED.unit_name,
                required_rarity = EXCLUDED.required_rarity,
                required_relic_tier = EXCLUDED.required_relic_tier,
                updated_at = NOW()
            `;
          }

          await deleteByKeys(
            'tb_platoon_slots',
            platoonId,
            platoon.slots.map((slot) => slot.slotKey),
            client
          );
        }

        await deleteByKeys(
          'tb_platoons',
          zoneId,
          zone.platoons.map((platoon) => platoon.platoonKey),
          client
        );
      }

      await deleteByKeys(
        'tb_zones',
        phaseId,
        phase.zones.map((zone) => zone.zoneKey),
        client
      );
    }

    await client.query(
      'DELETE FROM tb_phases WHERE tb_definition_id = $1 AND NOT (phase_number = ANY($2::int[]))',
      [tbDefinitionId, definition.phases.map((phase) => phase.phaseNumber)]
    );

    for (const [sourceName, sourceVersion] of Object.entries(sourceVersions)) {
      await client.sql`
        INSERT INTO tb_reference_versions (
          id,
          source_name,
          source_version,
          checked_at,
          imported_at
        ) VALUES (
          gen_random_uuid(),
          ${sourceName},
          ${sourceVersion},
          NOW(),
          NOW()
        )
        ON CONFLICT (source_name)
        DO UPDATE SET
          source_version = EXCLUDED.source_version,
          checked_at = NOW(),
          imported_at = NOW()
      `;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markSourcesChecked(sourceVersions: VersionMap): Promise<void> {
  for (const [sourceName, sourceVersion] of Object.entries(sourceVersions)) {
    await sql`
      INSERT INTO tb_reference_versions (
        id,
        source_name,
        source_version,
        checked_at,
        imported_at
      ) VALUES (
        gen_random_uuid(),
        ${sourceName},
        ${sourceVersion},
        NOW(),
        NULL
      )
      ON CONFLICT (source_name)
      DO UPDATE SET
        source_version = EXCLUDED.source_version,
        checked_at = NOW()
    `;
  }
}

function versionsChanged(current: VersionMap, stored: VersionMap): boolean {
  return Object.entries(current).some(([sourceName, sourceVersion]) => {
    return (stored[sourceName] ?? null) !== (sourceVersion ?? null);
  });
}

export async function importTerritoryBattleReferenceData(
  tbKey: ImportableTbKey,
  options: { force?: boolean } = {}
): Promise<TbImportResult> {
  if (tbKey !== 'rote') {
    throw new Error(`Unsupported territory battle import key: ${tbKey}`);
  }

  console.info(`[tb-import] checking ${tbKey} reference data`);

  const allVersions = await fetchAllVersions();
  const sourceVersions: VersionMap = {
    [TERRITORY_BATTLE_SOURCE]: allVersions.territoryBattleDefinitionVersion,
    [ROTE_OPERATIONS_SOURCE]:
      allVersions.roteOperationsVersion ?? allVersions.gameVersion ?? null,
  };

  console.info('[tb-import] source versions', sourceVersions);

  const storedVersions = await getStoredVersions(Object.keys(sourceVersions));
  const hasChanged = versionsChanged(sourceVersions, storedVersions);

  if (!options.force && !hasChanged) {
    await markSourcesChecked(sourceVersions);
    const counts = await getStoredCounts(tbKey);

    console.info('[tb-import] skipped import; source versions unchanged', counts);

    return {
      tbKey,
      tbName: 'Rise of the Empire',
      skipped: true,
      forced: false,
      sourceVersion: null,
      sourceVersions,
      counts,
    };
  }

  const [territoryBattleDefinition, roteOperations] = await Promise.all([
    fetchTerritoryBattleDefinition(),
    fetchRoteOperations(),
  ]);

  const normalized = normalizeRoteDefinition({
    allVersions,
    territoryBattleDefinition,
    roteOperations,
  });

  const counts = validateNormalizedDefinition(normalized);

  await upsertNormalizedDefinition(normalized, sourceVersions);

  console.info('[tb-import] imported reference data', {
    tbKey,
    sourceVersion: normalized.sourceVersion,
    counts,
  });

  return {
    tbKey,
    tbName: normalized.tbName,
    skipped: false,
    forced: options.force === true,
    sourceVersion: normalized.sourceVersion,
    sourceVersions,
    counts,
  };
}
