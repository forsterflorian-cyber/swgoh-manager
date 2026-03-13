export type ComlinkMemberContribution = {
  type: number;
  currentValue: string;
  lifetimeValue?: string;
};

export type ComlinkRawMember = {
  playerName: string;
  allyCode: number;
  memberContribution?: ComlinkMemberContribution[];
};

export type ComlinkGuildProfile = {
  id: string;
  name: string;
};

export type ComlinkGuildResponse = {
  guild: {
    profile: ComlinkGuildProfile;
    member: ComlinkRawMember[];
  };
};

/** Normalised member shape consumed by the sync service */
export type ComlinkGuildMember = {
  playerName: string;
  allyCode: string;
  galacticPower: number;
};
