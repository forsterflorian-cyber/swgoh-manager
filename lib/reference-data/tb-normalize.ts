import type {
  AllVersionsPayload,
  RoteOperationsPayload,
  TerritoryBattleDefinitionEntry,
  TerritoryBattleDefinitionPayload,
} from './gamedata-client.ts';

export type NormalizedTbDefinition = {
  tbKey: string;
  tbName: string;
  sourceVersion: string | null;
  totalPhases: number;
  phases: Array<{
    phaseNumber: number;
    zones: Array<{
      zoneKey: string;
      zoneName: string;
      sortOrder: number;
      isBonus: boolean;
      platoons: Array<{
        platoonKey: string;
        platoonNumber: number;
        sortOrder: number;
        slots: Array<{
          slotKey: string;
          slotNumber: number;
          unitBaseId: string;
          unitName?: string | null;
          rarity?: number | null;
          relicTier?: number | null;
        }>;
      }>;
    }>;
  }>;
};

const ROTE_TB_ID = 't05D';
const ROTE_TB_NAME = 'Rise of the Empire';

function parseTokenNumber(value: string | null | undefined, prefix: string): number | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseConflictNumberFromLinkedId(linkedConflictId: string | null | undefined): number | null {
  if (!linkedConflictId) {
    return null;
  }

  const match = linkedConflictId.match(/conflict(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parsePlatoonNumber(platoonId: string | null | undefined, fallback: number): number {
  if (!platoonId) {
    return fallback;
  }

  const match = platoonId.match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : fallback;
}

function buildZoneKey(phaseNumber: number, conflictNumber: number): string {
  return `rote-p${phaseNumber}-c${conflictNumber}`;
}

function buildBonusZoneKey(phaseNumber: number, operationId: string): string {
  const sanitized = operationId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `rote-p${phaseNumber}-bonus-${sanitized}`;
}

function findRoteDefinition(
  payload: TerritoryBattleDefinitionPayload
): TerritoryBattleDefinitionEntry | null {
  return (
    payload.data.find((entry) => entry.id === ROTE_TB_ID) ??
    payload.data.find((entry) => entry.territoryCategory === 'territory_tb3_hero') ??
    payload.data.find((entry) => entry.nameKey === 'TERRITORY_TB3_MIXED_NAME') ??
    null
  );
}

export function normalizeRoteDefinition(input: {
  allVersions: AllVersionsPayload;
  territoryBattleDefinition: TerritoryBattleDefinitionPayload;
  roteOperations: RoteOperationsPayload;
}): NormalizedTbDefinition {
  const roteDefinition = findRoteDefinition(input.territoryBattleDefinition);

  if (!roteDefinition) {
    throw new Error('Could not locate the Rise of the Empire definition in territoryBattleDefinition.json');
  }

  const totalPhases =
    typeof roteDefinition.roundCount === 'number' && roteDefinition.roundCount > 0
      ? roteDefinition.roundCount
      : 6;

  const linkedZones = new Map<
    string,
    { nameKey: string; forceAlignment: number | null }
  >();

  for (const conflictZone of roteDefinition.conflictZoneDefinition) {
    const zoneId = conflictZone.zoneDefinition.zoneId?.trim();
    const zoneName = conflictZone.zoneDefinition.nameKey?.trim();
    const forceAlignment = conflictZone.forceAlignment ?? null;

    if (zoneId && zoneName) {
      linkedZones.set(zoneId, {
        nameKey: zoneName,
        forceAlignment,
      });
    }
  }

  const phasesByNumber = new Map<number, NormalizedTbDefinition['phases'][number]>();

  for (let phaseNumber = 1; phaseNumber <= totalPhases; phaseNumber += 1) {
    phasesByNumber.set(phaseNumber, {
      phaseNumber,
      zones: [],
    });
  }

  const sortedOperations = [...input.roteOperations].sort((left, right) => {
    const phaseDiff =
      (parseTokenNumber(left.phase, 'P') ?? Number.MAX_SAFE_INTEGER) -
      (parseTokenNumber(right.phase, 'P') ?? Number.MAX_SAFE_INTEGER);

    if (phaseDiff !== 0) {
      return phaseDiff;
    }

    return (left.sort ?? Number.MAX_SAFE_INTEGER) - (right.sort ?? Number.MAX_SAFE_INTEGER);
  });

  for (const operation of sortedOperations) {
    const phaseNumber = parseTokenNumber(operation.phase, 'P');

    if (!phaseNumber) {
      continue;
    }

    const phase = phasesByNumber.get(phaseNumber);
    if (!phase) {
      continue;
    }

    // const conflictNumber =
    //   parseTokenNumber(operation.conflict ?? null, 'C') ??
    //   parseConflictNumberFromLinkedId(operation.linkedConflictId);

    // const isBonus = conflictNumber === null;
    // const zoneKey = isBonus
    //   ? buildBonusZoneKey(phaseNumber, operation.id)
    //   : buildZoneKey(phaseNumber, conflictNumber!);
    const conflictNumber =
      parseTokenNumber(operation.conflict ?? null, 'C') ??
      parseConflictNumberFromLinkedId(operation.linkedConflictId);

    const isBonus = conflictNumber === null;

    const zoneKey = isBonus
      ? buildBonusZoneKey(phaseNumber, operation.id)
      : buildZoneKey(phaseNumber, conflictNumber);

    const linkedZone = linkedZones.get(operation.linkedConflictId?.trim() ?? '');

    const zoneName =
      operation.nameKey?.trim() ||
      linkedZone?.nameKey ||
      (isBonus ? `Phase ${phaseNumber} Bonus` : `Phase ${phaseNumber} Zone ${conflictNumber}`);

    const platoons = [...operation.squads]
      .map((squad, squadIndex) => {
        const platoonNumber = parsePlatoonNumber(squad.id, squadIndex + 1);
        const platoonKey = `${zoneKey}-platoon-${platoonNumber}`;

        const slots = squad.units
          .map((unit, unitIndex) => {
            const unitBaseId = unit.baseId?.trim() || unit.unitIdentifier?.trim();

            if (!unitBaseId) {
              return null;
            }

            return {
              slotKey: `${platoonKey}-slot-${unitIndex + 1}`,
              slotNumber: unitIndex + 1,
              unitBaseId,
              unitName: unit.nameKey?.trim() || null,
              rarity: typeof unit.rarity === 'number' ? unit.rarity : null,
              relicTier:
                typeof unit.unitRelicTier === 'number' ? unit.unitRelicTier : null,
            };
          })
          .filter((slot): slot is NonNullable<typeof slot> => slot !== null);

        return {
          platoonKey,
          platoonNumber,
          sortOrder: platoonNumber,
          slots,
        };
      })
      .sort((left, right) => left.sortOrder - right.sortOrder);

    phase.zones.push({
      zoneKey,
      zoneName,
      sortOrder: isBonus
        ? (operation.sort ?? Number.MAX_SAFE_INTEGER)
        : (operation.sort ?? conflictNumber ?? Number.MAX_SAFE_INTEGER),
      isBonus,
      platoons,
    });
  }

  const phases = [...phasesByNumber.values()].map((phase) => ({
    ...phase,
    zones: phase.zones.sort((left, right) => left.sortOrder - right.sortOrder),
  }));

  const territoryBattleVersion =
    input.allVersions.territoryBattleDefinitionVersion ??
    input.territoryBattleDefinition.version ??
    null;
  const roteOperationsVersion =
    input.allVersions.roteOperationsVersion ?? input.allVersions.gameVersion ?? null;

  return {
    tbKey: 'rote',
    tbName: ROTE_TB_NAME,
    sourceVersion:
      territoryBattleVersion || roteOperationsVersion
        ? `territoryBattleDefinition=${territoryBattleVersion ?? 'unknown'}|swgoh_rote_operations=${roteOperationsVersion ?? 'unknown'}`
        : null,
    totalPhases,
    phases,
  };
}
