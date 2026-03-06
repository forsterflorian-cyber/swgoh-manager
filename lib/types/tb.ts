// lib/types/tb.ts

export interface ZoneRequirement {
  requirementId: string;
  unitBaseId: string;
  unitName: string;
  minRelic: number;
  minRarity: number;
  totalNeeded: number;
  isPlatoon: boolean;
  isCombatMission: boolean;
  platoonPosition: number | null;
}

export interface PlayerUnit {
  allyCode: string;
  playerName: string;
  memberId: string;
  unitBaseId: string;
  unitName: string;
  relicTier: number;
  rarity: number;
  gearLevel: number;
  galacticPower: number;
}

export interface GapAnalysisUnit {
  requirement: ZoneRequirement;
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
  relicDeficit: number;     // 0 = erfüllt, >0 = fehlt
  rarityDeficit: number;
  isAlreadyAssignedElsewhere: boolean;
  assignmentCount: number;  // Wie viele Zuweisungen hat der Spieler in dieser Phase?
  score: number;            // Bewertung: niedriger = besser
}

export interface AssignedPlayer {
  assignmentId: string;
  allyCode: string;
  playerName: string;
  memberId: string;
  relicTier: number;
  status: string;
}

export interface ZoneGapSummary {
  tbInstanceId: string;
  tbName: string;
  phase: number;
  zoneCode: string;
  zoneName: string;
  totalSlots: number;
  filledSlots: number;
  readySlots: number;
  gapSlots: number;
  completionPercent: number;
  units: GapAnalysisUnit[];
}