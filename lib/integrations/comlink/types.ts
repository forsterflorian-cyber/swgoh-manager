/** Guild member shape returned by POST /guild (guild.member[]) */
export type ComlinkGuildMember = {
  playerId: string;
  playerName: string;
  galacticPower: number;
};

/** Player detail returned by POST /player */
export type ComlinkPlayerDetail = {
  playerId: string;
  allyCode: string;
  name: string;
};

/** Merged member ready for DB upsert */
export type ComlinkMember = {
  playerId: string;
  playerName: string;
  allyCode: string;
  galacticPower: number;
};

/**
 * Unit metadata entry from POST /data { collection: ['units'] }.
 * combatType is the authoritative ship discriminator: 1 = character, 2 = ship.
 * This is never missing from the data collection for any playable unit.
 */
export type ComlinkUnitMetadata = {
  id: string;       // same as baseId — e.g. "SCYTHE"
  baseId: string;   // e.g. "SCYTHE"
  combatType: number; // 1 = character, 2 = ship
  nameKey?: string; // optional — used only for diagnostics
};

/** Single normalized roster unit from POST /player full profile */
export type ComlinkRosterUnit = {
  unitBaseId: string;  // e.g. "GRANDMASTERLUKE"
  rarity: number;      // 1-7 stars
  level: number;       // 1-85
  gearLevel: number;   // 1-13 (0 for ships)
  relicTier: number;   // 0-9 normalized (0 = no relic)
};

/** Full player profile from POST /player, including roster */
export type ComlinkPlayerProfile = {
  playerId: string;
  allyCode: string;
  name: string;
  rosterUnits: ComlinkRosterUnit[];
};
