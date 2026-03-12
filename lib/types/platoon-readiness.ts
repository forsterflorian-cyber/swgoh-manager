export interface StrategicPlannerGuild {
  id: string | null;
  name: string;
  slug: string | null;
  memberCount: number;
  rosteredMembers: number;
  rosterUnitCount: number;
  lastRosterSync: string | null;
}

export interface StrategicPlannerSlotInput {
  phase: number;
  zoneKey: string;
  zoneName: string;
  zoneSortOrder: number;
  platoonKey: string;
  platoonNumber: number;
  platoonSortOrder: number;
  slotKey: string;
  slotNumber: number;
  unitBaseId: string;
  unitName: string | null;
  requiredRelicTier: number;
  requiredRarity: number;
}

export interface StrategicPlannerRosterInput {
  memberId: string;
  allyCode: string;
  playerName: string;
  unitBaseId: string;
  unitName: string;
  relicTier: number;
  rarity: number;
}

export interface StrategicPlannerReference {
  id: string | null;
  tbKey: string;
  name: string;
  totalPhases: number;
  sourceVersion: string | null;
}

export interface StrategicPlannerDataset {
  mode: 'live' | 'fixture';
  fixtureName: string | null;
  guild: StrategicPlannerGuild | null;
  reference: StrategicPlannerReference | null;
  slots: StrategicPlannerSlotInput[];
  roster: StrategicPlannerRosterInput[];
}

export interface StrategicPlannerSummary {
  totalZones: number;
  totalPlatoons: number;
  totalSlots: number;
  coverableSlots: number;
  missingSlots: number;
  coveragePercent: number;
  estimatedCoverablePlatoons: number;
  blockedPlatoons: number;
  blockedZones: number;
  bottleneckUnitCount: number;
}

export interface StrategicRequirementSummary {
  phase: number;
  zoneKey: string;
  zoneName: string;
  platoonKey: string;
  platoonNumber: number;
  slotKey: string;
  slotNumber: number;
  unitBaseId: string;
  unitName: string | null;
  minRelic: number;
  minRarity: number;
  satisfyingMembers: number;
  ownedMembers: number;
  nearMissMembers: number;
  blocked: boolean;
}

export interface StrategicUnitImpact {
  unitBaseId: string;
  unitName: string;
  totalRequiredSlots: number;
  coverableSlots: number;
  missingSlots: number;
  uniqueOwners: number;
  nearMissOwners: number;
  blockedZones: number;
  blockedPlatoons: number;
  impactScore: number;
  strictestRequirement: {
    minRelic: number;
    minRarity: number;
  };
}

export interface StrategicZoneBlocker {
  unitBaseId: string;
  unitName: string;
  totalRequiredSlots: number;
  coverableSlots: number;
  missingSlots: number;
  nearMissOwners: number;
  blockedPlatoons: number;
}

export interface StrategicPlatoonStatus {
  platoonKey: string;
  platoonNumber: number;
  totalSlots: number;
  coverableSlots: number;
  missingSlots: number;
  status: 'ready' | 'partial' | 'blocked';
}

export interface StrategicZoneReadiness {
  phase: number;
  zoneKey: string;
  zoneName: string;
  totalPlatoons: number;
  totalSlots: number;
  coverableSlots: number;
  missingSlots: number;
  coveragePercent: number;
  estimatedCoverablePlatoons: number;
  blockedPlatoons: number;
  hardBlockedSlots: number;
  status: 'ready' | 'partial' | 'blocked';
  blockers: StrategicZoneBlocker[];
  platoons: StrategicPlatoonStatus[];
}

export interface StrategicPlannerDataState {
  hasGuild: boolean;
  hasRosterData: boolean;
  hasReferenceData: boolean;
  isFixture: boolean;
  rosterCoverageRatio: number;
}

export interface StrategicPlannerData {
  mode: 'live' | 'fixture';
  fixtureName: string | null;
  generatedAt: string;
  guild: StrategicPlannerGuild | null;
  reference: StrategicPlannerReference | null;
  summary: StrategicPlannerSummary | null;
  topMissingUnits: StrategicUnitImpact[];
  zones: StrategicZoneReadiness[];
  slotSummaries: StrategicRequirementSummary[];
  recommendedActions: string[];
  dataState: StrategicPlannerDataState;
}
