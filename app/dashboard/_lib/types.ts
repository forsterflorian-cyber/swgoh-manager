export type DashboardGuild = {
  id: string;
  name: string;
  slug: string | null;
  swgoh_gg_id: string | null;
  memberCount: number;
  rosteredMembers: number;
};

export type DashboardTb = {
  id: string;
  name: string;
  status: string;
};

export type DashboardStrategicReadiness = {
  reference: {
    name: string;
    tbKey: string;
  } | null;
  dataState: {
    hasGuild: boolean;
    hasRosterData: boolean;
    hasReferenceData: boolean;
    isFixture: boolean;
    rosterCoverageRatio: number;
  };
};

export type DashboardData = {
  guild: DashboardGuild | null;
  activeTb: DashboardTb | null;
  lastRosterSync: string | null;
  strategicReadiness: DashboardStrategicReadiness | null;
  permissions: {
    canManageGuild: boolean;
  };
};

export type GuildMemberSummary = {
  ally_code: string;
  player_name: string;
};

export type SyncStatus = {
  current: number;
  total: number;
  msg: string;
};

export type Notice = {
  tone: 'success' | 'error';
  message: string;
};

export type MemberRegistration = {
  guildId: string;
  allyCode: string;
  guildName: string;
  guildSlug: string;
};

export type RosterState = {
  label: string;
  tone: 'good' | 'warn' | 'bad';
  detail: string;
};
