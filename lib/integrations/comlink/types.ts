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
