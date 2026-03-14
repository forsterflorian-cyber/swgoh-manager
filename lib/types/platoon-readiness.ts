export interface StrategicPlannerGuild {
  id: string | null;
  name: string;
  slug: string | null;
  memberCount: number;
  rosteredMembers: number;
  rosterUnitCount: number;
  lastRosterSync: string | null;
}

export type PlanetCategory = 'LS' | 'DS' | 'MIX' | 'SPECIAL';

/** Whether a platoon slot requires a ship or a character. Derived at slot-load time from game data. */
export type UnitCategory = 'CHARACTER' | 'SHIP';

export type StrategicPlanetCategoryCounts = Record<PlanetCategory, number>;

export type StrategicMemberAssignmentLoad = StrategicPlanetCategoryCounts & {
  TOTAL: number;
};

export interface StrategicPlannerCapacityPressureSummary {
  nearCapacityByCategory: StrategicPlanetCategoryCounts;
  atCapacityMembers: number;
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
  /**
   * Whether this slot requires a ship or a character.
   * Derived once at slot-load time; all eligibility checks use this, not owner.gearLevel.
   */
  unitCategory: UnitCategory;
  requiredRelicTier: number;
  requiredRarity: number;
  planetCategory: PlanetCategory | null;
}

export interface StrategicPlannerRosterInput {
  memberId: string;
  allyCode: string;
  playerName: string;
  unitBaseId: string;
  unitName: string;
  relicTier: number;
  rarity: number;
  /** Comlink currentTier: 0 = ship (no relic requirement), 1–13 = character gear level, -1 = unknown */
  gearLevel: number;
}

export interface StrategicPlannerMemberInput {
  memberId: string;
  allyCode: string;
  playerName: string;
  galacticPower: number;
  lastSynced: string | null;
}

export interface StrategicPlannerAssignmentInput {
  id: string;
  guildId: string | null;
  guildMemberId: string;
  unitBaseId: string;
  planetCategory: PlanetCategory | null;
  note: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StrategicTargetState = 'ready' | 'near_miss' | 'owned_shortfall' | 'missing';

export interface StrategicTargetCandidate {
  guildMemberId: string;
  memberName: string;
  allyCode: string;
  state: StrategicTargetState;
  score: number;
  reasonSummary: string;
  currentRarity: number | null;
  currentRelicTier: number | null;
  meetsOwnership: boolean;
  missingCopies: number | null;
  missingRelicTiers: number;
  missingRarity: number;
  existingStrategicTargetCount: number;
  isAlreadyAssigned: boolean;
  capacityCategory: PlanetCategory | null;
  capacityLoad: StrategicMemberAssignmentLoad;
  capacityReached: boolean;
}

export interface StrategicTargetAssignment {
  id: string;
  guildId: string | null;
  guildMemberId: string;
  memberName: string;
  allyCode: string;
  unitBaseId: string;
  unitName: string;
  planetCategory: PlanetCategory | null;
  note: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  currentState: StrategicTargetState;
  currentRarity: number | null;
  currentRelicTier: number | null;
  meetsOwnership: boolean;
  missingCopies: number | null;
  missingRelicTiers: number;
  missingRarity: number;
  existingStrategicTargetCount: number;
  memberAssignmentLoad: StrategicMemberAssignmentLoad;
  whyItMatters: string;
  zoneHighlights: string[];
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
  members: StrategicPlannerMemberInput[];
  strategicAssignments: StrategicPlannerAssignmentInput[];
  permissions: StrategicPlannerPermissions;
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
  planetCategory: PlanetCategory | null;
  isBonus: boolean;
  satisfyingMembers: number;
  availableMembers: number;
  ownedMembers: number;
  nearMissMembers: number;
  status: 'covered' | 'ownership_shortage' | 'near_miss' | 'hard_missing';
  blocked: boolean;
}

export interface StrategicUnitImpact {
  unitBaseId: string;
  unitName: string;
  /** True when every known roster owner is a ship. Suppresses character-style relic wording in the UI. */
  isShipUnit: boolean;
  primaryPlanetCategory: PlanetCategory | null;
  totalRequiredSlots: number;
  coverableSlots: number;
  missingSlots: number;
  blockedSlots: number;
  shortageRatio: number;
  uniqueOwners: number;
  nearMissOwners: number;
  nearMissSlots: number;
  hardMissingSlots: number;
  ownershipShortageSlots: number;
  estimatedUnlockSlots: number;
  blockedZones: number;
  blockedPlatoons: number;
  limitingZones: number;
  limitingPlatoons: number;
  primaryConstraint: 'near_miss' | 'ownership_shortage' | 'hard_missing' | 'mixed';
  reasonSummary: string;
  impactScore: number;
  strictestRequirement: {
    minRelic: number;
    minRarity: number;
  };
  bestCandidates: StrategicTargetCandidate[];
  assignmentCount: number;
  assignedMemberNames: string[];
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

export interface StrategicPlannerPermissions {
  canManageTargets: boolean;
}

export interface StrategicPlannerData {
  mode: 'live' | 'fixture';
  fixtureName: string | null;
  generatedAt: string;
  guild: StrategicPlannerGuild | null;
  reference: StrategicPlannerReference | null;
  summary: StrategicPlannerSummary | null;
  memberCapacityPressure: StrategicPlannerCapacityPressureSummary;
  topMissingUnits: StrategicUnitImpact[];
  strategicTargets: StrategicTargetAssignment[];
  zones: StrategicZoneReadiness[];
  slotSummaries: StrategicRequirementSummary[];
  recommendedActions: string[];
  dataState: StrategicPlannerDataState;
  permissions: StrategicPlannerPermissions;
}
