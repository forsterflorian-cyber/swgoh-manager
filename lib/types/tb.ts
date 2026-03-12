export interface PlatoonSlotRequirement {
  tbPlatoonSlotId: string;
  tbPlatoonSlotKey: string;
  tbPlatoonId: string;
  tbPlatoonKey: string;
  platoonNumber: number;
  slotNumber: number;
  unitBaseId: string;
  unitName: string | null;
  minRelic: number;
  minRarity: number;
  zoneKey: string;
}

export interface GapAnalysisUnit {
  requirement: PlatoonSlotRequirement;
  totalNeeded: number;
  fulfilledCount: number;
  assignedCount: number;
  gapCount: number;
  status: 'complete' | 'partial' | 'critical' | 'empty';
  qualifiedPlayers: PlayerCandidate[];
  nearMissPlayers: PlayerCandidate[];
  assignedPlayers: AssignedPlayer[];
}

export interface PlayerCandidate {
  allyCode: string;
  playerName: string;
  memberId: string;
  relicTier: number;
  rarity: number;
  relicDeficit: number;
  rarityDeficit: number;
  isAlreadyAssignedElsewhere: boolean;
  assignmentCount: number;
  score: number;
}

export interface AssignedPlayer {
  assignmentId: string;
  allyCode: string;
  playerName: string;
  memberId: string;
  relicTier: number;
  status: string;
  hasConflict: boolean;
}

export interface ZoneGapSummary {
  tbInstanceId: string;
  tbName: string;
  totalPhases: number;
  phase: number;
  zoneKey: string;
  zoneName: string;
  totalSlots: number;
  filledSlots: number;
  readySlots: number;
  gapSlots: number;
  completionPercent: number;
  units: GapAnalysisUnit[];
}
