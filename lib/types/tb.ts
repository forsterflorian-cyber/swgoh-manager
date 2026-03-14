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

/**
 * Why an unassigned slot could not be (or has not been) filled.
 *
 * no_eligible_member   – nobody in the guild qualifies (relic / rarity deficit for all).
 * eligible_at_capacity – qualified members exist but every one has already reached the
 *                        10-assignment zone cap.
 * null                 – slot is either assigned or has open capacity (not yet auto-run).
 */
export type SlotOpenReason = 'no_eligible_member' | 'eligible_at_capacity' | null;

export interface GapAnalysisUnit {
  requirement: PlatoonSlotRequirement;
  totalNeeded: number;
  fulfilledCount: number;
  assignedCount: number;
  gapCount: number;
  status: 'complete' | 'partial' | 'critical' | 'empty';
  /** Set for unassigned slots only; null when slot is filled or reason is unclear. */
  openReason: SlotOpenReason;
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
  /** 'assigned' (legacy status value preserved as-is) */
  status: string;
  /** LOCKED = manual, officer-set; FLEX = auto-proposed, rebalanceable. */
  lockType: 'LOCKED' | 'FLEX';
  hasConflict: boolean;
}

export interface ZoneGapSummary {
  tbInstanceId: string;
  tbName: string;
  totalPhases: number;
  phase: number;
  zoneKey: string;
  zoneName: string;
  isBonus: boolean;
  totalSlots: number;
  filledSlots: number;
  readySlots: number;
  gapSlots: number;
  completionPercent: number;
  units: GapAnalysisUnit[];
}
