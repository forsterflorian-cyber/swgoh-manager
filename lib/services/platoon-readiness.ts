import { sql } from '@vercel/postgres';

import { getDemoPlatoonReadinessDataset } from '@/lib/services/platoon-readiness-fixture';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import {
  buildMemberAssignmentLoadMap,
  listGuildUpgradeAssignments,
  MAX_STATIONS_PER_MEMBER_PER_PLANET,
} from '@/lib/services/strategic-targets';
import type {
  PlanetCategory,
  UnitCategory,
  StrategicMemberAssignmentLoad,
  StrategicPlannerData,
  StrategicPlannerCapacityPressureSummary,
  StrategicPlannerDataset,
  StrategicPlannerGuild,
  StrategicPlannerMemberInput,
  StrategicPlanetCategoryCounts,
  StrategicPlannerReference,
  StrategicPlannerRosterInput,
  StrategicPlannerSlotInput,
  StrategicPlatoonStatus,
  StrategicRequirementSummary,
  StrategicTargetAssignment,
  StrategicTargetCandidate,
  StrategicTargetState,
  StrategicUnitImpact,
  StrategicZoneReadiness,
} from '@/lib/types/platoon-readiness';
import { toNumber } from '@/lib/utils/to-number';

// ---------------------------------------------------------------------------
// Debug tracing — set to the exact unitBaseId to trace, or '' to disable.
// Remove before shipping a production build.
// ---------------------------------------------------------------------------
const DEBUG_UNIT = '';

type AccessibleGuildRow = {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'officer' | 'member';
  member_count: string | number;
  last_roster_sync: string | null;
};

type ReferenceRow = {
  id: string;
  tb_key: string;
  name: string;
  total_phases: string | number;
  source_version: string | null;
};

type SlotRow = {
  phase_number: string | number;
  zone_key: string;
  zone_name: string;
  zone_sort_order: string | number;
  platoon_key: string;
  platoon_number: string | number;
  platoon_sort_order: string | number;
  slot_key: string;
  slot_number: string | number;
  unit_base_id: string;
  unit_name: string | null;
  required_relic_tier: string | number | null;
  required_rarity: string | number | null;
  is_bonus: boolean | null;
  planet_category: PlanetCategory | null;
};

type RosterRow = {
  member_id: string;
  ally_code: string;
  player_name: string;
  unit_base_id: string;
  unit_name: string;
  relic_tier: string | number | null;
  rarity: string | number | null;
  gear_level: string | number | null;
};

type GuildMemberRow = {
  id: string;
  ally_code: string;
  player_name: string;
  galactic_power: string | number;
  last_synced: string | null;
};

type PlannerOptions = {
  guildId?: string;
  fixture?: string | null;
};

const PLANET_CATEGORIES: PlanetCategory[] = ['LS', 'DS', 'MIX', 'SPECIAL'];

type UnitAllocation = {
  unitBaseId: string;
  unitName: string;
  /** True when every known owner is a ship (gearLevel === 0). Used to suppress relic-tier wording. */
  isShipUnit: boolean;
  totalRequiredSlots: number;
  coverableSlots: number;
  missingSlots: number;
  blockedSlots: number;
  uniqueOwners: number;
  nearMissOwners: number;
  nearMissSlots: number;
  hardMissingSlots: number;
  ownershipShortageSlots: number;
  estimatedUnlockSlots: number;
  blockedZoneKeys: Set<string>;
  blockedPlatoonKeys: Set<string>;
  strictestRequirement: {
    minRelic: number;
    minRarity: number;
  };
  slotSummaries: StrategicRequirementSummary[];
  usedOwnerKeys: string[];
};

type LimitingCounts = {
  zones: number;
  platoons: number;
};

type PlatoonGroup = {
  phase: number;
  zoneKey: string;
  zoneName: string;
  zoneSortOrder: number;
  platoonKey: string;
  platoonNumber: number;
  platoonSortOrder: number;
  slots: StrategicPlannerSlotInput[];
};

type ZoneGroup = {
  phase: number;
  zoneKey: string;
  zoneName: string;
  zoneSortOrder: number;
  slots: StrategicPlannerSlotInput[];
};

type CandidateReadiness = {
  state: StrategicTargetState;
  currentRelicTier: number | null;
  currentRarity: number | null;
  meetsOwnership: boolean;
  missingCopies: number | null;
  missingRelicTiers: number;
  missingRarity: number;
};

type StrategicImpactCore = Omit<
  StrategicUnitImpact,
  'impactScore' | 'reasonSummary' | 'bestCandidates' | 'assignmentCount' | 'assignedMemberNames'
>;

function createEmptyPlanetCategoryCounts(): StrategicPlanetCategoryCounts {
  return {
    LS: 0,
    DS: 0,
    MIX: 0,
    SPECIAL: 0,
  };
}

function createEmptyMemberAssignmentLoad(): StrategicMemberAssignmentLoad {
  return {
    ...createEmptyPlanetCategoryCounts(),
    TOTAL: 0,
  };
}

function createEmptyCapacityPressureSummary(): StrategicPlannerCapacityPressureSummary {
  return {
    nearCapacityByCategory: createEmptyPlanetCategoryCounts(),
    atCapacityMembers: 0,
  };
}

function inferPlanetCategory(input: {
  tbKey: string;
  zoneKey: string;
  zoneName: string;
  isBonus?: boolean | null;
}): PlanetCategory | null {
  // is_bonus is the authoritative source; no string fallback for SPECIAL.
  if (input.isBonus === true) {
    return 'SPECIAL';
  }

  const normalized = `${input.tbKey} ${input.zoneKey} ${input.zoneName}`.toLowerCase();

  if (
    normalized.includes('lightside') ||
    normalized.includes('light_side') ||
    /\blight\b/.test(normalized) ||
    /\bls\b/.test(normalized) ||
    input.tbKey.includes('lstb')
  ) {
    return 'LS';
  }

  if (
    normalized.includes('darkside') ||
    normalized.includes('dark_side') ||
    /\bdark\b/.test(normalized) ||
    /\bds\b/.test(normalized) ||
    input.tbKey.includes('dstb')
  ) {
    return 'DS';
  }

  return 'MIX';
}

function getPrimaryPlanetCategory(
  slotSummaries: StrategicRequirementSummary[]
): PlanetCategory | null {
  const blockedCounts = createEmptyPlanetCategoryCounts();
  const totalCounts = createEmptyPlanetCategoryCounts();

  for (const summary of slotSummaries) {
    if (!summary.planetCategory) {
      continue;
    }

    totalCounts[summary.planetCategory] += 1;
    if (summary.blocked) {
      blockedCounts[summary.planetCategory] += 1;
    }
  }

  const blockedLeader = [...PLANET_CATEGORIES].sort(
    (left, right) => blockedCounts[right] - blockedCounts[left]
  )[0];

  if (blockedLeader && blockedCounts[blockedLeader] > 0) {
    const blockedLeaderCount = blockedCounts[blockedLeader];
    const blockedLeaderTies = PLANET_CATEGORIES.filter(
      (category) => blockedCounts[category] === blockedLeaderCount
    );

    return blockedLeaderTies.length === 1 ? blockedLeader : null;
  }

  const totalLeader = [...PLANET_CATEGORIES].sort(
    (left, right) => totalCounts[right] - totalCounts[left]
  )[0];
  if (totalLeader && totalCounts[totalLeader] > 0) {
    const totalLeaderCount = totalCounts[totalLeader];
    const totalLeaderTies = PLANET_CATEGORIES.filter(
      (category) => totalCounts[category] === totalLeaderCount
    );

    return totalLeaderTies.length === 1 ? totalLeader : null;
  }

  return null;
}

function buildCapacityPressureSummary(
  memberLoadMap: Record<string, StrategicMemberAssignmentLoad>
): StrategicPlannerCapacityPressureSummary {
  const summary = createEmptyCapacityPressureSummary();

  for (const memberLoad of Object.values(memberLoadMap)) {
    for (const category of PLANET_CATEGORIES) {
      const categoryLoad = memberLoad[category];
      if (categoryLoad >= 7 && categoryLoad < MAX_STATIONS_PER_MEMBER_PER_PLANET) {
        summary.nearCapacityByCategory[category] += 1;
      }
    }

    if (PLANET_CATEGORIES.some((category) => memberLoad[category] >= MAX_STATIONS_PER_MEMBER_PER_PLANET)) {
      summary.atCapacityMembers += 1;
    }
  }

  return summary;
}

function getCapacityPenalty(load: number) {
  if (load >= MAX_STATIONS_PER_MEMBER_PER_PLANET) {
    return 999;
  }

  if (load >= 9) {
    return 42;
  }

  if (load >= 7) {
    return 18;
  }

  return 0;
}

function buildEmptyPlannerData(input: {
  mode: 'live' | 'fixture';
  fixtureName?: string | null;
  guild?: StrategicPlannerGuild | null;
  reference?: StrategicPlannerReference | null;
  recommendedActions: string[];
  canManageTargets?: boolean;
}): StrategicPlannerData {
  return {
    mode: input.mode,
    fixtureName: input.fixtureName ?? null,
    generatedAt: new Date().toISOString(),
    guild: input.guild ?? null,
    reference: input.reference ?? null,
    summary: null,
    memberCapacityPressure: createEmptyCapacityPressureSummary(),
    topMissingUnits: [],
    strategicTargets: [],
    zones: [],
    slotSummaries: [],
    recommendedActions: input.recommendedActions,
    dataState: {
      hasGuild: Boolean(input.guild),
      hasRosterData: false,
      hasReferenceData: Boolean(input.reference),
      isFixture: input.mode === 'fixture',
      rosterCoverageRatio: 0,
    },
    permissions: {
      canManageTargets: input.canManageTargets ?? false,
    },
    matchingInput: null,
    matching: {
      coverage: [],
      assignments: [],
      gaps: [],
      totalAssigned: 0,
      totalRequired: 0,
      coveragePercent: 100,
    },
  };
}

function ownerKey(owner: StrategicPlannerRosterInput) {
  return owner.memberId;
}

function qualifies(owner: StrategicPlannerRosterInput, slot: StrategicPlannerSlotInput) {
  if (DEBUG_UNIT && slot.unitBaseId === DEBUG_UNIT) {
    console.log('[qualifies:input]', {
      ownerMemberId: owner.memberId,
      ownerUnitBaseId: owner.unitBaseId,
      ownerRarity: owner.rarity,
      ownerRelicTier: owner.relicTier,
      ownerGearLevel: owner.gearLevel,
      slotUnitBaseId: slot.unitBaseId,
      slotUnitCategory: slot.unitCategory,
      slotRequiredRarity: slot.requiredRarity,
      slotRequiredRelicTier: slot.requiredRelicTier,
    });
  }

  if (owner.rarity < slot.requiredRarity) return false;

  // Ship slots have no relic track — the slot category is the authoritative classifier.
  if (slot.unitCategory === 'SHIP') {
    if (DEBUG_UNIT && slot.unitBaseId === DEBUG_UNIT) {
      console.log('[qualifies:ship-branch]', { result: true, ownerMemberId: owner.memberId });
    }
    return true;
  }

  if (DEBUG_UNIT && slot.unitBaseId === DEBUG_UNIT) {
    console.log('[qualifies:character-branch]', {
      ownerMemberId: owner.memberId,
      ownerRelicTier: owner.relicTier,
      slotRequiredRelicTier: slot.requiredRelicTier,
      result: owner.relicTier >= slot.requiredRelicTier,
    });
  }
  return owner.relicTier >= slot.requiredRelicTier;
}

function getDeficits(owner: StrategicPlannerRosterInput, slot: StrategicPlannerSlotInput) {
  if (DEBUG_UNIT && slot.unitBaseId === DEBUG_UNIT) {
    console.log('[deficits:input]', {
      ownerMemberId: owner.memberId,
      ownerUnitBaseId: owner.unitBaseId,
      ownerRarity: owner.rarity,
      ownerRelicTier: owner.relicTier,
      slotUnitBaseId: slot.unitBaseId,
      slotUnitCategory: slot.unitCategory,
      slotRequiredRarity: slot.requiredRarity,
      slotRequiredRelicTier: slot.requiredRelicTier,
    });
  }

  // Ships have no relic tier — always 0 regardless of what the slot's requiredRelicTier holds.
  const relicDeficit = slot.unitCategory === 'SHIP' ? 0 : Math.max(slot.requiredRelicTier - owner.relicTier, 0);
  const rarityDeficit = Math.max(slot.requiredRarity - owner.rarity, 0);

  if (DEBUG_UNIT && slot.unitBaseId === DEBUG_UNIT) {
    const tag = slot.unitCategory === 'SHIP' ? '[deficits:ship-result]' : '[deficits:character-result]';
    console.log(tag, { relicDeficit, rarityDeficit, ownerMemberId: owner.memberId });
  }

  return { relicDeficit, rarityDeficit };
}

function isNearMiss(owner: StrategicPlannerRosterInput, slot: StrategicPlannerSlotInput) {
  const deficits = getDeficits(owner, slot);
  const missingSomething = deficits.relicDeficit > 0 || deficits.rarityDeficit > 0;

  return missingSomething && deficits.relicDeficit <= 2 && deficits.rarityDeficit <= 1;
}

function compareRequirements(left: StrategicPlannerSlotInput, right: StrategicPlannerSlotInput) {
  if (right.requiredRelicTier !== left.requiredRelicTier) {
    return right.requiredRelicTier - left.requiredRelicTier;
  }

  if (right.requiredRarity !== left.requiredRarity) {
    return right.requiredRarity - left.requiredRarity;
  }

  if (left.phase !== right.phase) {
    return left.phase - right.phase;
  }

  if (left.zoneSortOrder !== right.zoneSortOrder) {
    return left.zoneSortOrder - right.zoneSortOrder;
  }

  if (left.platoonSortOrder !== right.platoonSortOrder) {
    return left.platoonSortOrder - right.platoonSortOrder;
  }

  return left.slotNumber - right.slotNumber;
}

function compareOwnersForAssignment(
  left: StrategicPlannerRosterInput,
  right: StrategicPlannerRosterInput
) {
  if (left.relicTier !== right.relicTier) {
    return left.relicTier - right.relicTier;
  }

  if (left.rarity !== right.rarity) {
    return left.rarity - right.rarity;
  }

  return left.playerName.localeCompare(right.playerName);
}

function sortSlotSummaries(
  left: StrategicRequirementSummary,
  right: StrategicRequirementSummary
) {
  if (left.phase !== right.phase) {
    return left.phase - right.phase;
  }

  if (left.zoneName !== right.zoneName) {
    return left.zoneName.localeCompare(right.zoneName);
  }

  if (left.platoonNumber !== right.platoonNumber) {
    return left.platoonNumber - right.platoonNumber;
  }

  return left.slotNumber - right.slotNumber;
}

function allocateRequirements(
  requirements: StrategicPlannerSlotInput[],
  owners: StrategicPlannerRosterInput[]
): UnitAllocation {
  const sortedRequirements = [...requirements].sort(compareRequirements);
  const sortedOwners = [...owners].sort(compareOwnersForAssignment);
  const remainingOwnerKeys = new Set(sortedOwners.map(ownerKey));
  const blockedZoneKeys = new Set<string>();
  const blockedPlatoonKeys = new Set<string>();
  const nearMissOwnerKeys = new Set<string>();
  const usedOwnerKeys: string[] = [];

  let coverableSlots = 0;
  let blockedSlots = 0;
  let nearMissSlots = 0;
  let hardMissingSlots = 0;
  let ownershipShortageSlots = 0;
  const slotSummaries: StrategicRequirementSummary[] = [];

  for (const requirement of sortedRequirements) {
    const satisfyingOwners = sortedOwners.filter((owner) => qualifies(owner, requirement));
    const availableOwners = satisfyingOwners
      .filter((owner) => remainingOwnerKeys.has(ownerKey(owner)))
      .sort(compareOwnersForAssignment);
    const nearMissOwners = sortedOwners.filter((owner) => isNearMiss(owner, requirement));
    const candidate = availableOwners[0];
    let status: StrategicRequirementSummary['status'] = 'covered';

    if (candidate) {
      remainingOwnerKeys.delete(ownerKey(candidate));
      usedOwnerKeys.push(ownerKey(candidate));
      coverableSlots += 1;
    } else {
      blockedSlots += 1;
      blockedZoneKeys.add(requirement.zoneKey);
      blockedPlatoonKeys.add(requirement.platoonKey);

      if (satisfyingOwners.length > 0) {
        status = 'ownership_shortage';
        ownershipShortageSlots += 1;
      } else if (nearMissOwners.length > 0) {
        status = 'near_miss';
        nearMissSlots += 1;
        for (const owner of nearMissOwners) {
          nearMissOwnerKeys.add(ownerKey(owner));
        }
      } else {
        status = 'hard_missing';
        hardMissingSlots += 1;
      }
    }

    slotSummaries.push({
      phase: requirement.phase,
      zoneKey: requirement.zoneKey,
      zoneName: requirement.zoneName,
      platoonKey: requirement.platoonKey,
      platoonNumber: requirement.platoonNumber,
      slotKey: requirement.slotKey,
      slotNumber: requirement.slotNumber,
      unitBaseId: requirement.unitBaseId,
      unitName: requirement.unitName,
      minRelic: requirement.requiredRelicTier,
      minRarity: requirement.requiredRarity,
      planetCategory: requirement.planetCategory,
      isBonus: requirement.planetCategory === 'SPECIAL',
      satisfyingMembers: satisfyingOwners.length,
      availableMembers: availableOwners.length,
      ownedMembers: sortedOwners.length,
      nearMissMembers: nearMissOwners.length,
      status,
      blocked: status !== 'covered',
    });
  }

  const firstRequirement = sortedRequirements[0];
  const missingSlots = Math.max(sortedRequirements.length - coverableSlots, 0);

  // Derived from the slot definition — the canonical classifier. Never from owner.gearLevel.
  const isShipUnit = firstRequirement?.unitCategory === 'SHIP';

  // Debug log: fires for every ship unit so ship-slot evaluation is always observable.
  if (isShipUnit) {
    console.log(
      `[planner] ship-slot unit=${firstRequirement?.unitBaseId} ` +
      `total_owners=${sortedOwners.length} ` +
      `coverable=${coverableSlots} blocked=${blockedSlots} hard_missing=${hardMissingSlots}`
    );
  }

  return {
    unitBaseId: firstRequirement?.unitBaseId ?? 'UNKNOWN',
    unitName: firstRequirement?.unitName ?? firstRequirement?.unitBaseId ?? 'Unknown Unit',
    isShipUnit,
    totalRequiredSlots: sortedRequirements.length,
    coverableSlots,
    missingSlots,
    blockedSlots,
    uniqueOwners: sortedOwners.length,
    nearMissOwners: nearMissOwnerKeys.size,
    nearMissSlots,
    hardMissingSlots: hardMissingSlots + ownershipShortageSlots,
    ownershipShortageSlots,
    estimatedUnlockSlots: Math.min(missingSlots, nearMissOwnerKeys.size),
    blockedZoneKeys,
    blockedPlatoonKeys,
    strictestRequirement: {
      minRelic: firstRequirement?.requiredRelicTier ?? 0,
      minRarity: firstRequirement?.requiredRarity ?? 0,
    },
    slotSummaries,
    usedOwnerKeys,
  };
}

function groupSlotsByUnit(
  slots: StrategicPlannerSlotInput[]
): Map<string, StrategicPlannerSlotInput[]> {
  const groups = new Map<string, StrategicPlannerSlotInput[]>();

  for (const slot of slots) {
    const existing = groups.get(slot.unitBaseId);
    if (existing) {
      existing.push(slot);
      continue;
    }

    groups.set(slot.unitBaseId, [slot]);
  }

  return groups;
}

function groupSlotsByZone(slots: StrategicPlannerSlotInput[]): ZoneGroup[] {
  const groups = new Map<string, ZoneGroup>();

  for (const slot of slots) {
    const existing = groups.get(slot.zoneKey);
    if (existing) {
      existing.slots.push(slot);
      continue;
    }

    groups.set(slot.zoneKey, {
      phase: slot.phase,
      zoneKey: slot.zoneKey,
      zoneName: slot.zoneName,
      zoneSortOrder: slot.zoneSortOrder,
      slots: [slot],
    });
  }

  return [...groups.values()].sort((left, right) => {
    if (left.phase !== right.phase) {
      return left.phase - right.phase;
    }

    if (left.zoneSortOrder !== right.zoneSortOrder) {
      return left.zoneSortOrder - right.zoneSortOrder;
    }

    return left.zoneName.localeCompare(right.zoneName);
  });
}

function groupSlotsByPlatoon(slots: StrategicPlannerSlotInput[]): PlatoonGroup[] {
  const groups = new Map<string, PlatoonGroup>();

  for (const slot of slots) {
    const existing = groups.get(slot.platoonKey);
    if (existing) {
      existing.slots.push(slot);
      continue;
    }

    groups.set(slot.platoonKey, {
      phase: slot.phase,
      zoneKey: slot.zoneKey,
      zoneName: slot.zoneName,
      zoneSortOrder: slot.zoneSortOrder,
      platoonKey: slot.platoonKey,
      platoonNumber: slot.platoonNumber,
      platoonSortOrder: slot.platoonSortOrder,
      slots: [slot],
    });
  }

  return [...groups.values()].sort((left, right) => {
    if (left.phase !== right.phase) {
      return left.phase - right.phase;
    }

    if (left.zoneSortOrder !== right.zoneSortOrder) {
      return left.zoneSortOrder - right.zoneSortOrder;
    }

    return left.platoonNumber - right.platoonNumber;
  });
}

function toOwnerMap(roster: StrategicPlannerRosterInput[]) {
  const ownersByUnit = new Map<string, StrategicPlannerRosterInput[]>();

  for (const owner of roster) {
    const existing = ownersByUnit.get(owner.unitBaseId);
    if (existing) {
      existing.push(owner);
      continue;
    }

    ownersByUnit.set(owner.unitBaseId, [owner]);
  }

  return ownersByUnit;
}

function toMemberUnitMap(roster: StrategicPlannerRosterInput[]) {
  return new Map<string, StrategicPlannerRosterInput>(
    roster.map((entry) => [`${entry.memberId}:${entry.unitBaseId}`, entry])
  );
}

function toUnitNameMap(slots: StrategicPlannerSlotInput[], roster: StrategicPlannerRosterInput[]) {
  const unitNames = new Map<string, string>();

  for (const slot of slots) {
    if (!unitNames.has(slot.unitBaseId)) {
      unitNames.set(slot.unitBaseId, slot.unitName ?? slot.unitBaseId);
    }
  }

  for (const owner of roster) {
    if (!unitNames.has(owner.unitBaseId)) {
      unitNames.set(owner.unitBaseId, owner.unitName);
    }
  }

  return unitNames;
}

function toAssignmentCountMap(assignments: StrategicPlannerDataset['strategicAssignments']) {
  const counts = new Map<string, number>();

  for (const assignment of assignments) {
    counts.set(
      assignment.guildMemberId,
      (counts.get(assignment.guildMemberId) ?? 0) + 1
    );
  }

  return counts;
}

function getTargetStatePriority(state: StrategicTargetState) {
  switch (state) {
    case 'near_miss':
      return 0;
    case 'owned_shortfall':
      return 1;
    case 'missing':
      return 2;
    case 'ready':
    default:
      return 3;
  }
}

function getCandidateReadiness(
  owner: StrategicPlannerRosterInput | undefined,
  requirement: StrategicUnitImpact['strictestRequirement'],
  isShipUnit: boolean = false
): CandidateReadiness {
  if (!owner) {
    const result: CandidateReadiness = {
      state: 'missing',
      currentRelicTier: null,
      currentRarity: null,
      meetsOwnership: false,
      missingCopies: 1,
      // Ships have no relic track — never show a relic deficit even for missing owners.
      missingRelicTiers: isShipUnit ? 0 : requirement.minRelic,
      missingRarity: requirement.minRarity,
    };
    // No owner — unitBaseId unknown here, log unconditionally when DEBUG_UNIT is set
    // so missing-owner ship candidates are also visible.
    if (DEBUG_UNIT && isShipUnit) {
      console.log('[candidate-readiness:result]', {
        ownerMemberId: null,
        ownerUnitBaseId: null,
        isShipUnit,
        requirementMinRelic: requirement.minRelic,
        requirementMinRarity: requirement.minRarity,
        missingRelicTiers: result.missingRelicTiers,
        missingRarity: result.missingRarity,
        state: result.state,
      });
    }
    return result;
  }

  // Use slot-derived isShipUnit, not owner.gearLevel, so roster_cache entries (gearLevel = -1)
  // are handled correctly.
  const missingRelicTiers = isShipUnit ? 0 : Math.max(requirement.minRelic - owner.relicTier, 0);
  const missingRarity = Math.max(requirement.minRarity - owner.rarity, 0);

  if (missingRelicTiers === 0 && missingRarity === 0) {
    const result: CandidateReadiness = {
      state: 'ready',
      currentRelicTier: owner.relicTier,
      currentRarity: owner.rarity,
      meetsOwnership: true,
      missingCopies: 0,
      missingRelicTiers,
      missingRarity,
    };
    if (DEBUG_UNIT && owner.unitBaseId === DEBUG_UNIT) {
      console.log('[candidate-readiness:result]', {
        ownerMemberId: owner.memberId,
        ownerUnitBaseId: owner.unitBaseId,
        ownerGearLevel: owner.gearLevel,
        isShipUnit,
        currentRarity: owner.rarity,
        currentRelicTier: owner.relicTier,
        missingRelicTiers,
        missingRarity,
        state: result.state,
      });
    }
    return result;
  }

  const state =
    missingRelicTiers <= 2 && missingRarity <= 1 ? 'near_miss' : 'owned_shortfall';

  const result: CandidateReadiness = {
    state,
    currentRelicTier: owner.relicTier,
    currentRarity: owner.rarity,
    meetsOwnership: true,
    missingCopies: 0,
    missingRelicTiers,
    missingRarity,
  };

  if (DEBUG_UNIT && owner.unitBaseId === DEBUG_UNIT) {
    console.log('[candidate-readiness:result]', {
      ownerMemberId: owner.memberId,
      ownerUnitBaseId: owner.unitBaseId,
      ownerGearLevel: owner.gearLevel,
      isShipUnit,
      currentRarity: owner.rarity,
      currentRelicTier: owner.relicTier,
      missingRelicTiers,
      missingRarity,
      state,
    });
  }

  return result;
}

function calculateCandidateScore(input: {
  readiness: CandidateReadiness;
  existingStrategicTargetCount: number;
  isAlreadyAssigned: boolean;
  capacityCategory: PlanetCategory | null;
  capacityLoad: StrategicMemberAssignmentLoad;
}) {
  const baseScore = {
    near_miss: 125,
    owned_shortfall: 85,
    missing: 40,
    ready: 12,
  }[input.readiness.state];
  const closenessBonus = input.readiness.meetsOwnership
    ? Math.max(
        0,
        24 - input.readiness.missingRelicTiers * 8 - input.readiness.missingRarity * 10
      )
    : 0;
  const loadPenalty = input.existingStrategicTargetCount * 18;
  const alreadyAssignedPenalty = input.isAlreadyAssigned ? 70 : 0;
  const capacityPenalty = input.capacityCategory
    ? getCapacityPenalty(input.capacityLoad[input.capacityCategory])
    : 0;

  return Math.max(
    baseScore + closenessBonus - loadPenalty - alreadyAssignedPenalty - capacityPenalty,
    0
  );
}

function formatRequirementDeficits(readiness: CandidateReadiness) {
  const parts: string[] = [];

  if (readiness.missingRelicTiers > 0) {
    parts.push(
      `${readiness.missingRelicTiers} relic tier${readiness.missingRelicTiers === 1 ? '' : 's'}`
    );
  }

  if (readiness.missingRarity > 0) {
    parts.push(`${readiness.missingRarity} star${readiness.missingRarity === 1 ? '' : 's'}`);
  }

  return parts.length > 0 ? parts.join(' and ') : '0 upgrades';
}

function buildCandidateReasonSummary(input: {
  member: StrategicPlannerMemberInput;
  unitName: string;
  readiness: CandidateReadiness;
  existingStrategicTargetCount: number;
  isAlreadyAssigned: boolean;
  capacityCategory: PlanetCategory | null;
  capacityLoad: StrategicMemberAssignmentLoad;
}) {
  const baseReason =
    input.readiness.state === 'near_miss'
      ? `${input.member.playerName} already owns ${input.unitName} and is only ${formatRequirementDeficits(input.readiness)} short of the strictest requirement.`
      : input.readiness.state === 'owned_shortfall'
        ? `${input.member.playerName} owns ${input.unitName}, but still needs ${formatRequirementDeficits(input.readiness)} to qualify.`
        : input.readiness.state === 'ready'
          ? `${input.member.playerName} already meets the strictest current platoon requirement for ${input.unitName}.`
          : input.member.lastSynced
            ? `${input.member.playerName} has no synced roster copy of ${input.unitName} yet, so this would be a fresh ownership target.`
            : `${input.member.playerName} has no synced roster data for ${input.unitName} yet, so the planner currently treats this as missing ownership.`;
  const capacityLoad =
    input.capacityCategory ? input.capacityLoad[input.capacityCategory] : null;
  const capacityReason =
    input.capacityCategory && capacityLoad !== null
      ? capacityLoad >= MAX_STATIONS_PER_MEMBER_PER_PLANET
        ? `${input.capacityCategory} capacity is already ${capacityLoad}/${MAX_STATIONS_PER_MEMBER_PER_PLANET}.`
        : capacityLoad >= 7
          ? `${input.capacityCategory} capacity is already ${capacityLoad}/${MAX_STATIONS_PER_MEMBER_PER_PLANET}, so this member is nearing the station limit.`
          : `${input.capacityCategory} capacity is currently ${capacityLoad}/${MAX_STATIONS_PER_MEMBER_PER_PLANET}.`
      : 'Planet category is still pending for this target, so capacity pressure is advisory only.';

  if (input.isAlreadyAssigned) {
    return `${baseReason} ${capacityReason} This member already owns the same strategic target.`;
  }

  if (input.existingStrategicTargetCount > 0) {
    return `${baseReason} ${capacityReason} ${input.existingStrategicTargetCount} other strategic target${input.existingStrategicTargetCount === 1 ? ' is' : 's are'} already assigned.`;
  }

  return `${baseReason} ${capacityReason}`;
}

function buildZoneHighlights(
  slotSummaries: StrategicRequirementSummary[],
  unitBaseId: string
): string[] {
  const blockedZones = [
    ...new Set(
      slotSummaries
        .filter((summary) => summary.unitBaseId === unitBaseId && summary.blocked)
        .map((summary) => summary.zoneName)
    ),
  ];

  if (blockedZones.length > 0) {
    return blockedZones.slice(0, 3);
  }

  return [
    ...new Set(
      slotSummaries
        .filter((summary) => summary.unitBaseId === unitBaseId)
        .map((summary) => summary.zoneName)
    ),
  ].slice(0, 3);
}

function rankCandidatesForUnit(input: {
  impact: StrategicImpactCore;
  members: StrategicPlannerMemberInput[];
  rosterByMemberUnit: Map<string, StrategicPlannerRosterInput>;
  assignmentCounts: Map<string, number>;
  memberAssignmentLoadMap: Record<string, StrategicMemberAssignmentLoad>;
  assignedMemberIds: Set<string>;
}): StrategicTargetCandidate[] {
  return input.members
    .map<StrategicTargetCandidate>((member) => {
      const rosterEntry = input.rosterByMemberUnit.get(
        `${member.memberId}:${input.impact.unitBaseId}`
      );
      const readiness = getCandidateReadiness(rosterEntry, input.impact.strictestRequirement, input.impact.isShipUnit);
      const existingStrategicTargetCount = input.assignmentCounts.get(member.memberId) ?? 0;
      const capacityLoad =
        input.memberAssignmentLoadMap[member.memberId] ?? createEmptyMemberAssignmentLoad();
      const capacityCategory = input.impact.primaryPlanetCategory;
      const isAlreadyAssigned = input.assignedMemberIds.has(member.memberId);
      const capacityReached = capacityCategory
        ? capacityLoad[capacityCategory] >= MAX_STATIONS_PER_MEMBER_PER_PLANET
        : false;

      return {
        guildMemberId: member.memberId,
        memberName: member.playerName,
        allyCode: member.allyCode,
        state: readiness.state,
        score: calculateCandidateScore({
          readiness,
          existingStrategicTargetCount,
          isAlreadyAssigned,
          capacityCategory,
          capacityLoad,
        }),
        reasonSummary: buildCandidateReasonSummary({
          member,
          unitName: input.impact.unitName,
          readiness,
          existingStrategicTargetCount,
          isAlreadyAssigned,
          capacityCategory,
          capacityLoad,
        }),
        currentRarity: readiness.currentRarity,
        currentRelicTier: readiness.currentRelicTier,
        meetsOwnership: readiness.meetsOwnership,
        missingCopies: readiness.missingCopies,
        missingRelicTiers: readiness.missingRelicTiers,
        missingRarity: readiness.missingRarity,
        existingStrategicTargetCount,
        isAlreadyAssigned,
        capacityCategory,
        capacityLoad,
        capacityReached,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (getTargetStatePriority(left.state) !== getTargetStatePriority(right.state)) {
        return getTargetStatePriority(left.state) - getTargetStatePriority(right.state);
      }

      if (left.existingStrategicTargetCount !== right.existingStrategicTargetCount) {
        return left.existingStrategicTargetCount - right.existingStrategicTargetCount;
      }

      if (left.capacityCategory && right.capacityCategory) {
        const leftCapacityLoad = left.capacityLoad[left.capacityCategory];
        const rightCapacityLoad = right.capacityLoad[right.capacityCategory];

        if (leftCapacityLoad !== rightCapacityLoad) {
          return leftCapacityLoad - rightCapacityLoad;
        }
      }

      return left.memberName.localeCompare(right.memberName);
    })
    .slice(0, 6);
}

function getPrimaryConstraint(
  allocation: UnitAllocation
): StrategicUnitImpact['primaryConstraint'] {
  const structuralHardMissingSlots = Math.max(
    allocation.hardMissingSlots - allocation.ownershipShortageSlots,
    0
  );
  const highestPressure = Math.max(
    allocation.nearMissSlots,
    allocation.ownershipShortageSlots,
    structuralHardMissingSlots
  );

  const matchingConstraints: StrategicUnitImpact['primaryConstraint'][] = [
    allocation.nearMissSlots === highestPressure && highestPressure > 0 ? 'near_miss' : null,
    allocation.ownershipShortageSlots === highestPressure && highestPressure > 0
      ? 'ownership_shortage'
      : null,
    structuralHardMissingSlots === highestPressure && highestPressure > 0
      ? 'hard_missing'
      : null,
  ].filter(
    (
      constraint
    ): constraint is Exclude<StrategicUnitImpact['primaryConstraint'], 'mixed'> =>
      constraint !== null
  );

  if (matchingConstraints.length !== 1) {
    return 'mixed';
  }

  return matchingConstraints[0];
}

function calculateBaseImpactScore(
  impact: StrategicImpactCore
) {
  return (
    impact.blockedSlots * 100 +
    impact.blockedPlatoons * 65 +
    impact.blockedZones * 90 +
    Math.round(impact.shortageRatio * 100) +
    impact.hardMissingSlots * 18 +
    impact.ownershipShortageSlots * 22 +
    impact.nearMissSlots * 16 +
    impact.estimatedUnlockSlots * 28 +
    impact.strictestRequirement.minRelic * 3 +
    impact.strictestRequirement.minRarity
  );
}

function buildReasonSummary(
  impact: StrategicImpactCore
): string {
  const parts: string[] = [
    `Blocks ${impact.blockedSlots} slot${impact.blockedSlots === 1 ? '' : 's'} across ${impact.blockedZones} zone${
      impact.blockedZones === 1 ? '' : 's'
    } and ${impact.blockedPlatoons} platoon${impact.blockedPlatoons === 1 ? '' : 's'}.`,
  ];

  if (impact.limitingZones > 0 || impact.limitingPlatoons > 0) {
    parts.push(
      `Primary bottleneck in ${impact.limitingZones} zone${
        impact.limitingZones === 1 ? '' : 's'
      } and ${impact.limitingPlatoons} platoon${impact.limitingPlatoons === 1 ? '' : 's'}.`
    );
  }

  if (impact.nearMissSlots > 0 && impact.hardMissingSlots > 0) {
    parts.push(
      `${impact.estimatedUnlockSlots} slot${impact.estimatedUnlockSlots === 1 ? '' : 's'} look upgradeable from near-miss owners, while ${impact.hardMissingSlots} still need more qualified copies.`
    );
  } else if (impact.nearMissSlots > 0) {
    parts.push(
      `Mostly a near-miss upgrade target: ${impact.estimatedUnlockSlots} slot${
        impact.estimatedUnlockSlots === 1 ? '' : 's'
      } could open through relic or rarity upgrades.`
    );
  } else if (impact.ownershipShortageSlots > 0) {
    parts.push(
      'Capacity issue: some members already qualify, but the guild does not have enough copies to satisfy repeated platoon demand.'
    );
  } else {
    parts.push(
      'Mostly hard missing: the guild lacks enough realistic qualifying copies for these requirements.'
    );
  }

  return parts.join(' ');
}

function toImpact(
  allocation: UnitAllocation,
  limitingCounts: LimitingCounts = { zones: 0, platoons: 0 }
): StrategicUnitImpact {
  const shortageRatio =
    allocation.totalRequiredSlots > 0
      ? allocation.missingSlots / allocation.totalRequiredSlots
      : 0;
  const primaryConstraint = getPrimaryConstraint(allocation);
  const primaryPlanetCategory = getPrimaryPlanetCategory(allocation.slotSummaries);

  const impactWithoutScore = {
    unitBaseId: allocation.unitBaseId,
    unitName: allocation.unitName,
    isShipUnit: allocation.isShipUnit,
    primaryPlanetCategory,
    totalRequiredSlots: allocation.totalRequiredSlots,
    coverableSlots: allocation.coverableSlots,
    missingSlots: allocation.missingSlots,
    blockedSlots: allocation.blockedSlots,
    shortageRatio,
    uniqueOwners: allocation.uniqueOwners,
    nearMissOwners: allocation.nearMissOwners,
    nearMissSlots: allocation.nearMissSlots,
    hardMissingSlots: allocation.hardMissingSlots,
    ownershipShortageSlots: allocation.ownershipShortageSlots,
    estimatedUnlockSlots: allocation.estimatedUnlockSlots,
    blockedZones: allocation.blockedZoneKeys.size,
    blockedPlatoons: allocation.blockedPlatoonKeys.size,
    limitingZones: limitingCounts.zones,
    limitingPlatoons: limitingCounts.platoons,
    primaryConstraint,
    strictestRequirement: allocation.strictestRequirement,
  };
  const impactScore =
    calculateBaseImpactScore(impactWithoutScore) +
    limitingCounts.platoons * 45 +
    limitingCounts.zones * 70;

  return {
    ...impactWithoutScore,
    reasonSummary: buildReasonSummary(impactWithoutScore),
    impactScore,
    bestCandidates: [],
    assignmentCount: 0,
    assignedMemberNames: [],
  };
}

function sortImpacts(left: StrategicUnitImpact, right: StrategicUnitImpact) {
  if (right.impactScore !== left.impactScore) {
    return right.impactScore - left.impactScore;
  }

  if (right.missingSlots !== left.missingSlots) {
    return right.missingSlots - left.missingSlots;
  }

  if (right.blockedZones !== left.blockedZones) {
    return right.blockedZones - left.blockedZones;
  }

  return left.unitName.localeCompare(right.unitName);
}

function countLimitingFactors(
  groups: Array<{ slots: StrategicPlannerSlotInput[] }>,
  ownersByUnit: Map<string, StrategicPlannerRosterInput[]>
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const group of groups) {
    const impacts = [...groupSlotsByUnit(group.slots).entries()]
      .map(([unitBaseId, requirements]) =>
        toImpact(allocateRequirements(requirements, ownersByUnit.get(unitBaseId) ?? []))
      )
      .filter((impact) => impact.blockedSlots > 0)
      .sort(sortImpacts);

    if (impacts.length === 0) {
      continue;
    }

    const topScore = impacts[0].impactScore;
    const topImpacts = impacts.filter((impact) => impact.impactScore === topScore);

    for (const impact of topImpacts) {
      counts.set(impact.unitBaseId, (counts.get(impact.unitBaseId) ?? 0) + 1);
    }
  }

  return counts;
}

function buildPlatoonStatuses(
  platoons: PlatoonGroup[],
  slotSummaryByKey: Map<string, StrategicRequirementSummary>
): StrategicPlatoonStatus[] {
  return platoons.map((platoon) => {
    const missingSlots = platoon.slots.reduce((count, slot) => {
      const summary = slotSummaryByKey.get(slot.slotKey);
      return count + (summary?.blocked ? 1 : 0);
    }, 0);

    const coverableSlots = platoon.slots.reduce((count, slot) => {
      const summary = slotSummaryByKey.get(slot.slotKey);
      return count + (summary?.blocked ? 0 : 1);
    }, 0);

    const status =
      missingSlots === 0
        ? 'ready'
        : coverableSlots === 0
          ? 'blocked'
          : 'partial';

    return {
      platoonKey: platoon.platoonKey,
      platoonNumber: platoon.platoonNumber,
      totalSlots: platoon.slots.length,
      coverableSlots,
      missingSlots,
      status,
    };
  });
}

function estimateCoverablePlatoons(
  platoons: PlatoonGroup[],
  ownersByUnit: Map<string, StrategicPlannerRosterInput[]>,
  slotSummaryByKey: Map<string, StrategicRequirementSummary>
) {
  const remainingOwners = new Map<string, StrategicPlannerRosterInput[]>();

  for (const [unitBaseId, owners] of ownersByUnit.entries()) {
    remainingOwners.set(unitBaseId, [...owners]);
  }

  const rankedPlatoons = [...platoons].sort((left, right) => {
    const leftSummaries = left.slots.map((slot) => slotSummaryByKey.get(slot.slotKey));
    const rightSummaries = right.slots.map((slot) => slotSummaryByKey.get(slot.slotKey));
    const leftMin = leftSummaries.reduce((min, summary) => {
      const count = summary?.satisfyingMembers ?? 0;
      return Math.min(min, count);
    }, Number.MAX_SAFE_INTEGER);
    const rightMin = rightSummaries.reduce((min, summary) => {
      const count = summary?.satisfyingMembers ?? 0;
      return Math.min(min, count);
    }, Number.MAX_SAFE_INTEGER);

    if (rightMin !== leftMin) {
      return rightMin - leftMin;
    }

    const leftTotal = leftSummaries.reduce(
      (count, summary) => count + (summary?.satisfyingMembers ?? 0),
      0
    );
    const rightTotal = rightSummaries.reduce(
      (count, summary) => count + (summary?.satisfyingMembers ?? 0),
      0
    );

    if (rightTotal !== leftTotal) {
      return rightTotal - leftTotal;
    }

    return left.platoonNumber - right.platoonNumber;
  });

  let coverablePlatoons = 0;

  for (const platoon of rankedPlatoons) {
    const groupedRequirements = groupSlotsByUnit(platoon.slots);
    const committedOwnersByUnit = new Map<string, Set<string>>();
    let canCover = true;

    for (const [unitBaseId, requirements] of groupedRequirements.entries()) {
      const availableOwners = remainingOwners.get(unitBaseId) ?? [];
      const allocation = allocateRequirements(requirements, availableOwners);

      if (allocation.coverableSlots < requirements.length) {
        canCover = false;
        break;
      }

      committedOwnersByUnit.set(unitBaseId, new Set(allocation.usedOwnerKeys));
    }

    if (!canCover) {
      continue;
    }

    for (const [unitBaseId, usedOwners] of committedOwnersByUnit.entries()) {
      const availableOwners = remainingOwners.get(unitBaseId) ?? [];
      remainingOwners.set(
        unitBaseId,
        availableOwners.filter((owner) => !usedOwners.has(ownerKey(owner)))
      );
    }

    coverablePlatoons += 1;
  }

  return coverablePlatoons;
}

function buildRecommendedActions(input: {
  hasReferenceData: boolean;
  hasRosterData: boolean;
  hasGuild: boolean;
  topMissingUnits: StrategicUnitImpact[];
  zones: StrategicZoneReadiness[];
}): string[] {
  if (!input.hasGuild) {
    return ['Select or create a guild to start platoon readiness analysis.'];
  }

  if (!input.hasReferenceData) {
    return ['Import Territory Battle reference data before strategic readiness can be calculated.'];
  }

  if (!input.hasRosterData) {
    return ['Run a guild roster sync so the planner can measure platoon ownership and relic bottlenecks.'];
  }

  const actions: string[] = [];
  const topUnit = input.topMissingUnits[0];
  const topZone = [...input.zones].sort((left, right) => {
    if (right.missingSlots !== left.missingSlots) {
      return right.missingSlots - left.missingSlots;
    }

    return left.phase - right.phase;
  })[0];

  if (topUnit) {
    actions.push(`${topUnit.unitName} is the biggest blocker. ${topUnit.reasonSummary}`);
  }

  if (topZone) {
    actions.push(
      `Phase ${topZone.phase} ${topZone.zoneName} is the most constrained zone with ${topZone.missingSlots} missing slot${
        topZone.missingSlots === 1 ? '' : 's'
      } and ${topZone.blockedPlatoons} blocked platoon${
        topZone.blockedPlatoons === 1 ? '' : 's'
      }.`
    );
  }

  if (actions.length === 0) {
    actions.push('Current roster data can cover every imported platoon slot.');
  }

  return actions;
}

function analyzeDataset(dataset: StrategicPlannerDataset): StrategicPlannerData {
  const generatedAt = new Date().toISOString();
  const guild = dataset.guild;
  const reference = dataset.reference;
  const uniqueRosteredMembers = new Set(dataset.roster.map((entry) => entry.allyCode));

  if (!guild) {
    return {
      ...buildEmptyPlannerData({
        mode: dataset.mode,
        fixtureName: dataset.fixtureName,
        recommendedActions: ['Select or create a guild to start platoon readiness analysis.'],
        canManageTargets: dataset.permissions.canManageTargets,
      }),
      generatedAt,
    };
  }

  if (!reference || dataset.slots.length === 0) {
    return {
      ...buildEmptyPlannerData({
        mode: dataset.mode,
        fixtureName: dataset.fixtureName,
        guild: {
          ...guild,
          rosteredMembers: uniqueRosteredMembers.size,
          rosterUnitCount: dataset.roster.length,
        },
        recommendedActions: [
          'Import Territory Battle reference data before strategic readiness can be calculated.',
        ],
        canManageTargets: dataset.permissions.canManageTargets,
      }),
      generatedAt,
      dataState: {
        hasGuild: true,
        hasRosterData: dataset.roster.length > 0,
        hasReferenceData: false,
        isFixture: dataset.mode === 'fixture',
        rosterCoverageRatio:
          guild.memberCount > 0 ? uniqueRosteredMembers.size / guild.memberCount : 0,
      },
    };
  }

  const normalizedGuild: StrategicPlannerGuild = {
    ...guild,
    rosteredMembers: uniqueRosteredMembers.size,
    rosterUnitCount: dataset.roster.length,
  };
  const ownersByUnit = toOwnerMap(dataset.roster);
  const rosterByMemberUnit = toMemberUnitMap(dataset.roster);
  const assignmentCounts = toAssignmentCountMap(dataset.strategicAssignments);
  const memberAssignmentLoadMap = buildMemberAssignmentLoadMap(dataset.strategicAssignments);
  const memberCapacityPressure = buildCapacityPressureSummary(memberAssignmentLoadMap);
  const membersById = new Map(dataset.members.map((member) => [member.memberId, member]));
  const unitNameMap = toUnitNameMap(dataset.slots, dataset.roster);
  const zoneGroups = groupSlotsByZone(dataset.slots);
  const allPlatoons = groupSlotsByPlatoon(dataset.slots);
  const overallUnitAllocations = [...groupSlotsByUnit(dataset.slots).entries()].map(
    ([unitBaseId, requirements]) =>
      allocateRequirements(requirements, ownersByUnit.get(unitBaseId) ?? [])
  );
  const limitingZoneCounts = countLimitingFactors(zoneGroups, ownersByUnit);
  const limitingPlatoonCounts = countLimitingFactors(allPlatoons, ownersByUnit);
  const slotSummaries = overallUnitAllocations
    .flatMap((allocation) => allocation.slotSummaries)
    .sort(sortSlotSummaries);
  const slotSummaryByKey = new Map(slotSummaries.map((summary) => [summary.slotKey, summary]));
  const allUnitImpacts = overallUnitAllocations
    .map((allocation) =>
      toImpact(allocation, {
        zones: limitingZoneCounts.get(allocation.unitBaseId) ?? 0,
        platoons: limitingPlatoonCounts.get(allocation.unitBaseId) ?? 0,
      })
    );
  const impactByUnitBaseId = new Map(allUnitImpacts.map((impact) => [impact.unitBaseId, impact]));

  const strategicTargets = dataset.strategicAssignments
    .map<StrategicTargetAssignment | null>((assignment) => {
      const member = membersById.get(assignment.guildMemberId);
      if (!member) {
        return null;
      }

      const impact = impactByUnitBaseId.get(assignment.unitBaseId);
      const unitName =
        impact?.unitName ?? unitNameMap.get(assignment.unitBaseId) ?? assignment.unitBaseId;
      const readiness = getCandidateReadiness(
        rosterByMemberUnit.get(`${assignment.guildMemberId}:${assignment.unitBaseId}`),
        impact?.strictestRequirement ?? { minRelic: 0, minRarity: 0 },
        impact?.isShipUnit ?? false
      );

      return {
        id: assignment.id,
        guildId: assignment.guildId,
        guildMemberId: assignment.guildMemberId,
        memberName: member.playerName,
        allyCode: member.allyCode,
        unitBaseId: assignment.unitBaseId,
        unitName,
        planetCategory: assignment.planetCategory,
        note: assignment.note,
        createdByUserId: assignment.createdByUserId,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
        currentState: readiness.state,
        currentRarity: readiness.currentRarity,
        currentRelicTier: readiness.currentRelicTier,
        meetsOwnership: readiness.meetsOwnership,
        missingCopies: readiness.missingCopies,
        missingRelicTiers: readiness.missingRelicTiers,
        missingRarity: readiness.missingRarity,
        existingStrategicTargetCount: assignmentCounts.get(assignment.guildMemberId) ?? 0,
        memberAssignmentLoad:
          memberAssignmentLoadMap[assignment.guildMemberId] ?? createEmptyMemberAssignmentLoad(),
        whyItMatters:
          impact && impact.missingSlots > 0
            ? impact.reasonSummary
            : 'This target is currently no longer a top guild-wide blocker in the latest readiness snapshot.',
        zoneHighlights: buildZoneHighlights(slotSummaries, assignment.unitBaseId),
      };
    })
    .filter((assignment): assignment is StrategicTargetAssignment => assignment !== null)
    .sort((left, right) => {
      if (getTargetStatePriority(left.currentState) !== getTargetStatePriority(right.currentState)) {
        return getTargetStatePriority(left.currentState) - getTargetStatePriority(right.currentState);
      }

      const leftImpact = impactByUnitBaseId.get(left.unitBaseId)?.impactScore ?? 0;
      const rightImpact = impactByUnitBaseId.get(right.unitBaseId)?.impactScore ?? 0;

      if (rightImpact !== leftImpact) {
        return rightImpact - leftImpact;
      }

      return right.createdAt.localeCompare(left.createdAt);
    });

  const topMissingUnits = allUnitImpacts
    .filter((impact) => impact.missingSlots > 0)
    .sort(sortImpacts)
    .map((impact) => {
      const assignedMembers = strategicTargets.filter(
        (assignment) => assignment.unitBaseId === impact.unitBaseId
      );

      return {
        ...impact,
        bestCandidates: rankCandidatesForUnit({
          impact,
          members: dataset.members,
          rosterByMemberUnit,
          assignmentCounts,
          memberAssignmentLoadMap,
          assignedMemberIds: new Set(assignedMembers.map((assignment) => assignment.guildMemberId)),
        }),
        assignmentCount: assignedMembers.length,
        assignedMemberNames: assignedMembers
          .map((assignment) => assignment.memberName)
          .sort((left, right) => left.localeCompare(right)),
      };
    });

  const zones = zoneGroups.map<StrategicZoneReadiness>((zone) => {
    const zoneOwners = toOwnerMap(dataset.roster);
    const zoneUnitAllocations = [...groupSlotsByUnit(zone.slots).entries()].map(
      ([unitBaseId, requirements]) =>
        allocateRequirements(requirements, zoneOwners.get(unitBaseId) ?? [])
    );
    const zoneImpact = zoneUnitAllocations
      .map((allocation) => toImpact(allocation))
      .filter((impact) => impact.missingSlots > 0)
      .sort(sortImpacts);
    const platoons = groupSlotsByPlatoon(zone.slots);
    const estimatedCoverablePlatoons = estimateCoverablePlatoons(
      platoons,
      zoneOwners,
      slotSummaryByKey
    );
    const totalSlots = zone.slots.length;
    const coverableSlots = zoneUnitAllocations.reduce(
      (count, allocation) => count + allocation.coverableSlots,
      0
    );
    const missingSlots = Math.max(totalSlots - coverableSlots, 0);
    const hardBlockedSlots = zone.slots.reduce((count, slot) => {
      const summary = slotSummaryByKey.get(slot.slotKey);
      return count + (summary?.blocked ? 1 : 0);
    }, 0);
    const totalPlatoons = platoons.length;
    const blockedPlatoons = Math.max(totalPlatoons - estimatedCoverablePlatoons, 0);
    const status =
      missingSlots === 0
        ? 'ready'
        : estimatedCoverablePlatoons === 0 || hardBlockedSlots > 0
          ? 'blocked'
          : 'partial';

    return {
      phase: zone.phase,
      zoneKey: zone.zoneKey,
      zoneName: zone.zoneName,
      totalPlatoons,
      totalSlots,
      coverableSlots,
      missingSlots,
      coveragePercent: totalSlots > 0 ? Math.round((coverableSlots / totalSlots) * 100) : 0,
      estimatedCoverablePlatoons,
      blockedPlatoons,
      hardBlockedSlots,
      status,
      blockers: zoneImpact.slice(0, 4).map((impact) => ({
        unitBaseId: impact.unitBaseId,
        unitName: impact.unitName,
        totalRequiredSlots: impact.totalRequiredSlots,
        coverableSlots: impact.coverableSlots,
        missingSlots: impact.missingSlots,
        nearMissOwners: impact.nearMissOwners,
        blockedPlatoons: impact.blockedPlatoons,
      })),
      platoons: buildPlatoonStatuses(platoons, slotSummaryByKey),
    };
  });

  const estimatedCoverablePlatoons = estimateCoverablePlatoons(
    allPlatoons,
    ownersByUnit,
    slotSummaryByKey
  );
  const totalSlots = dataset.slots.length;
  const coverableSlots = overallUnitAllocations.reduce(
    (count, allocation) => count + allocation.coverableSlots,
    0
  );
  const missingSlots = Math.max(totalSlots - coverableSlots, 0);

  if (dataset.mode === 'live') {
    console.log(
      `[planner] analysis complete mode=${dataset.mode} ` +
      `total_slots=${totalSlots} coverable=${coverableSlots} missing=${missingSlots} ` +
      `coverage=${totalSlots > 0 ? Math.round((coverableSlots / totalSlots) * 100) : 0}% ` +
      `roster_rows=${dataset.roster.length}`
    );
  }

  const summary = {
    totalZones: zones.length,
    totalPlatoons: allPlatoons.length,
    totalSlots,
    coverableSlots,
    missingSlots,
    coveragePercent: totalSlots > 0 ? Math.round((coverableSlots / totalSlots) * 100) : 0,
    estimatedCoverablePlatoons,
    blockedPlatoons: Math.max(allPlatoons.length - estimatedCoverablePlatoons, 0),
    blockedZones: zones.filter((zone) => zone.status !== 'ready').length,
    bottleneckUnitCount: topMissingUnits.length,
  };

  const hasRosterData = dataset.roster.length > 0;

  return {
    mode: dataset.mode,
    fixtureName: dataset.fixtureName,
    generatedAt,
    guild: normalizedGuild,
    reference,
    summary,
    memberCapacityPressure,
    topMissingUnits,
    strategicTargets,
    zones,
    slotSummaries,
    recommendedActions: buildRecommendedActions({
      hasReferenceData: true,
      hasRosterData,
      hasGuild: true,
      topMissingUnits,
      zones,
    }),
    dataState: {
      hasGuild: true,
      hasRosterData,
      hasReferenceData: true,
      isFixture: dataset.mode === 'fixture',
      rosterCoverageRatio:
        normalizedGuild.memberCount > 0
          ? normalizedGuild.rosteredMembers / normalizedGuild.memberCount
          : 0,
    },
    permissions: dataset.permissions,
    matchingInput: {
      slots: dataset.slots,
      roster: dataset.roster,
      members: dataset.members,
    },
    matching: computePlatoonMatching(dataset),
  };
}

async function getAccessibleGuild(
  userId: string,
  guildId?: string
): Promise<AccessibleGuildRow | null> {
  const result = guildId
      ? await sql<AccessibleGuildRow>`
        SELECT
          g.id,
          g.name,
          g.slug,
          p.role::text AS role,
          (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) AS member_count,
          (SELECT MAX(last_synced)::text FROM guild_members WHERE guild_id = g.id) AS last_roster_sync
        FROM permissions p
        JOIN guilds g ON g.id = p.guild_id
        WHERE p.user_id = ${userId}
          AND g.id = ${guildId}
        ORDER BY
          CASE p.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'officer' THEN 2
            ELSE 3
          END,
          g.created_at ASC
        LIMIT 1
      `
    : await sql<AccessibleGuildRow>`
        SELECT
          g.id,
          g.name,
          g.slug,
          p.role::text AS role,
          (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) AS member_count,
          (SELECT MAX(last_synced)::text FROM guild_members WHERE guild_id = g.id) AS last_roster_sync
        FROM permissions p
        JOIN guilds g ON g.id = p.guild_id
        WHERE p.user_id = ${userId}
        ORDER BY
          CASE p.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'officer' THEN 2
            ELSE 3
          END,
          g.created_at ASC
        LIMIT 1
      `;

  return result.rows[0] ?? null;
}

async function getReferenceDefinition(): Promise<StrategicPlannerReference | null> {
  const result = await sql<ReferenceRow>`
    SELECT id, tb_key, name, total_phases, source_version
    FROM tb_definitions
    WHERE is_active = true
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `;

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    tbKey: row.tb_key,
    name: row.name,
    totalPhases: toNumber(row.total_phases, 6),
    sourceVersion: row.source_version,
  };
}

async function loadSlotsForReference(
  reference: Pick<StrategicPlannerReference, 'id' | 'tbKey'>
): Promise<StrategicPlannerSlotInput[]> {
  const result = await sql<SlotRow>`
    SELECT
      tp.phase_number,
      tz.zone_key,
      tz.name AS zone_name,
      tz.sort_order AS zone_sort_order,
      tz.is_bonus,
      tz.planet_category,
      tpl.platoon_key,
      tpl.platoon_number,
      tpl.sort_order AS platoon_sort_order,
      tps.slot_key,
      tps.slot_number,
      tps.unit_base_id,
      tps.unit_name,
      tps.required_relic_tier,
      tps.required_rarity
    FROM tb_phases tp
    JOIN tb_zones tz ON tz.tb_phase_id = tp.id
    JOIN tb_platoons tpl ON tpl.tb_zone_id = tz.id
    JOIN tb_platoon_slots tps ON tps.tb_platoon_id = tpl.id
    WHERE tp.tb_definition_id = ${reference.id}
    ORDER BY tp.phase_number ASC, tz.sort_order ASC, tpl.sort_order ASC, tps.slot_number ASC
  `;

  // Detect which units are ships before mapping rows.
  // gear_level = 0 is an intrinsic game property stored in player_roster by Comlink sync.
  // We query globally (not per-guild) because unit type is not a per-player attribute.
  // This is the single authoritative classification point; evaluation functions consume
  // slot.unitCategory and never inspect owner.gearLevel for ship detection.
  const allUnitBaseIds = [...new Set(result.rows.map((r) => r.unit_base_id))];
  const shipUnitIds = await detectShipUnitIds(allUnitBaseIds);

  if (shipUnitIds.size > 0) {
    console.log(
      `[planner] slot-load ship-detection tb=${reference.tbKey} ` +
      `ship_units=${shipUnitIds.size}/${allUnitBaseIds.length}: ${[...shipUnitIds].join(',')}`
    );
  }

  return result.rows.map((row) => {
    const unitCategory = (shipUnitIds.has(row.unit_base_id) ? 'SHIP' : 'CHARACTER') as UnitCategory;
    const requiredRelicTier = Math.max(0, toNumber(row.required_relic_tier) - 2);
    const requiredRarity = toNumber(row.required_rarity, 7);

    if (DEBUG_UNIT && row.unit_base_id === DEBUG_UNIT) {
      console.log('[slot-load]', {
        unitBaseId: row.unit_base_id,
        unitName: row.unit_name,
        unitCategory,
        requiredRarity,
        requiredRelicTier,
        rawRequiredRelicTier: toNumber(row.required_relic_tier),
        inShipUnitIds: shipUnitIds.has(row.unit_base_id),
      });
    }

    return {
      phase: toNumber(row.phase_number),
      zoneKey: row.zone_key,
      zoneName: row.zone_name,
      zoneSortOrder: toNumber(row.zone_sort_order),
      platoonKey: row.platoon_key,
      platoonNumber: toNumber(row.platoon_number),
      platoonSortOrder: toNumber(row.platoon_sort_order),
      slotKey: row.slot_key,
      slotNumber: toNumber(row.slot_number),
      unitBaseId: row.unit_base_id,
      unitName: row.unit_name,
      unitCategory,
      requiredRelicTier,
      requiredRarity,
      planetCategory:
        row.planet_category ??
        inferPlanetCategory({
          tbKey: reference.tbKey,
          zoneKey: row.zone_key,
          zoneName: row.zone_name,
          isBonus: row.is_bonus,
        }),
     };
  });
}

async function loadRosterFromPlayerRoster(
  guildId: string,
  unitBaseIds: string[]
): Promise<StrategicPlannerRosterInput[]> {
  const result = await sql.query<RosterRow>(
    `
      SELECT
        gm.id          AS member_id,
        COALESCE(gm.ally_code, gm.player_id) AS ally_code,
        gm.player_name,
        pr.unit_base_id,
        pr.unit_base_id AS unit_name,
        pr.relic_tier,
        pr.rarity,
        pr.gear_level
      FROM player_roster pr
      JOIN guild_members gm
        ON gm.player_id = pr.player_id
       AND gm.guild_id  = pr.guild_id
      WHERE pr.guild_id    = $1
        AND pr.unit_base_id = ANY($2::text[])
      ORDER BY pr.unit_base_id ASC, pr.relic_tier DESC, pr.rarity DESC, gm.player_name ASC
    `,
    [guildId, unitBaseIds]
  );

  return result.rows.map((row) => ({
    memberId: row.member_id,
    allyCode: row.ally_code,
    playerName: row.player_name,
    unitBaseId: row.unit_base_id,
    unitName: row.unit_name,
    relicTier: toNumber(row.relic_tier),
    rarity: toNumber(row.rarity, 7),
    gearLevel: toNumber(row.gear_level, -1),
  }));
}

async function loadRosterFromRosterCache(
  guildId: string,
  unitBaseIds: string[]
): Promise<StrategicPlannerRosterInput[]> {
  const result = await sql.query<RosterRow>(
    `
      SELECT
        gm.id AS member_id,
        rc.ally_code,
        gm.player_name,
        rc.unit_base_id,
        rc.unit_name,
        rc.relic_tier,
        rc.rarity
      FROM roster_cache rc
      JOIN guild_members gm
        ON gm.ally_code = rc.ally_code
       AND gm.guild_id  = rc.guild_id
      WHERE rc.guild_id    = $1
        AND rc.unit_base_id = ANY($2::text[])
      ORDER BY rc.unit_base_id ASC, rc.relic_tier DESC, rc.rarity DESC, gm.player_name ASC
    `,
    [guildId, unitBaseIds]
  );

  return result.rows.map((row) => ({
    memberId: row.member_id,
    allyCode: row.ally_code,
    playerName: row.player_name,
    unitBaseId: row.unit_base_id,
    unitName: row.unit_name,
    relicTier: toNumber(row.relic_tier),
    rarity: toNumber(row.rarity, 7),
    gearLevel: -1, // roster_cache has no gear_level; -1 = unknown (treated as character)
  }));
}

/**
 * Returns the set of unitBaseIds that are ships according to *any* guild's player_roster.
 * gear_level = 0 is an intrinsic game property of ships, not per-guild state, so querying
 * across guilds is correct and safe. This is only called when the roster_cache fallback is
 * used (i.e. the guild has never synced via Comlink).
 */
async function detectShipUnitIds(unitBaseIds: string[]): Promise<ReadonlySet<string>> {
  if (unitBaseIds.length === 0) return new Set<string>();
  const result = await sql.query<{ unit_base_id: string }>(
    `SELECT DISTINCT unit_base_id FROM player_roster WHERE unit_base_id = ANY($1) AND gear_level = 0`,
    [unitBaseIds]
  );
  return new Set(result.rows.map((r) => r.unit_base_id));
}

export async function getIgnoredMemberIds(guildId: string): Promise<ReadonlySet<string>> {
  const result = await sql<{ id: string }>`
    SELECT id
    FROM guild_members
    WHERE guild_id = ${guildId}
      AND ignored_at IS NOT NULL
  `;
  return new Set(result.rows.map((r) => r.id));
}

async function loadRosterForUnits(
  guildId: string,
  unitBaseIds: string[]
): Promise<StrategicPlannerRosterInput[]> {
  if (unitBaseIds.length === 0) {
    return [];
  }

  // Primary source: player_roster (Comlink-synced via /api/guild/roster-sync).
  // Falls back to roster_cache (swgoh.gg-synced) if player_roster is empty for this guild.
  // Ship detection is no longer done here — it is stamped onto slot.unitCategory at slot-load
  // time via detectShipUnitIds(), so gearLevel in roster rows is not used for classification.
  const fromPlayerRoster = await loadRosterFromPlayerRoster(guildId, unitBaseIds);
  const rosterSource = fromPlayerRoster.length > 0 ? 'player_roster' : 'roster_cache';
  const rawRoster =
    fromPlayerRoster.length > 0
      ? fromPlayerRoster
      : await loadRosterFromRosterCache(guildId, unitBaseIds);

  // Filter out ignored members
  const ignoredMembers = await getIgnoredMemberIds(guildId);
  const roster = rawRoster.filter((entry) => !ignoredMembers.has(entry.memberId));

  // ---- Part D diagnostics -----------------------------------------------
  const distinctUnitsRequired = unitBaseIds.length;
  const unitsWithAtLeastOneOwner = new Set(roster.map((r) => r.unitBaseId)).size;
  const distinctMembersInRoster  = new Set(roster.map((r) => r.memberId)).size;
  const missingUnitsInRoster     = distinctUnitsRequired - unitsWithAtLeastOneOwner;

  console.log(
    `[planner] roster source=${rosterSource} ` +
    `guild=${guildId} ` +
    `required_unit_types=${distinctUnitsRequired} ` +
    `roster_rows=${roster.length} ` +
    `distinct_members=${distinctMembersInRoster} ` +
    `units_with_owner=${unitsWithAtLeastOneOwner} ` +
    `units_no_owner=${missingUnitsInRoster} ` +
    `ignored_members=${ignoredMembers.size}`
  );
  // -----------------------------------------------------------------------

  return roster;
}

async function loadGuildMembers(guildId: string): Promise<StrategicPlannerMemberInput[]> {
  const result = await sql<GuildMemberRow>`
    SELECT
      id,
      ally_code,
      player_name,
      galactic_power,
      last_synced::text
    FROM guild_members
    WHERE guild_id = ${guildId}
    ORDER BY player_name ASC
  `;

  return result.rows.map((row) => ({
    memberId: row.id,
    allyCode: row.ally_code,
    playerName: row.player_name,
    galacticPower: toNumber(row.galactic_power),
    lastSynced: row.last_synced,
  }));
}

async function loadLiveDataset(
  userId: string,
  guildId?: string
): Promise<StrategicPlannerDataset> {
  const guildRow = await getAccessibleGuild(userId, guildId);
  if (!guildRow) {
    return {
      mode: 'live',
      fixtureName: null,
      guild: null,
      reference: null,
      slots: [],
      roster: [],
      members: [],
      strategicAssignments: [],
      permissions: {
        canManageTargets: false,
      },
    };
  }

  const guild: StrategicPlannerGuild = {
    id: guildRow.id,
    name: guildRow.name,
    slug: guildRow.slug,
    memberCount: toNumber(guildRow.member_count),
    rosteredMembers: 0,
    rosterUnitCount: 0,
    lastRosterSync: guildRow.last_roster_sync,
  };

  const reference = await getReferenceDefinition();
  if (!reference?.id) {
    return {
      mode: 'live',
      fixtureName: null,
      guild,
      reference: null,
      slots: [],
      roster: [],
      members: await loadGuildMembers(guildRow.id),
      strategicAssignments: await listGuildUpgradeAssignments(guildRow.id),
      permissions: {
        canManageTargets:
          guildRow.role === 'owner' || guildRow.role === 'admin' || guildRow.role === 'officer',
      },
    };
  }

  const slots = await loadSlotsForReference(reference);
  const unitBaseIds = [...new Set(slots.map((slot) => slot.unitBaseId))];

  console.log(
    `[planner] loading live dataset guild=${guildRow.id} ` +
    `total_slots=${slots.length} distinct_unit_types=${unitBaseIds.length}`
  );

  const [roster, members, strategicAssignments] = await Promise.all([
    loadRosterForUnits(guildRow.id, unitBaseIds),
    loadGuildMembers(guildRow.id),
    listGuildUpgradeAssignments(guildRow.id),
  ]);

  return {
    mode: 'live',
    fixtureName: null,
    guild,
    reference,
    slots,
    roster,
    members,
    strategicAssignments,
    permissions: {
      canManageTargets:
        guildRow.role === 'owner' || guildRow.role === 'admin' || guildRow.role === 'officer',
    },
  };
}

export class PlatoonReadinessService {
  static async analyzeForUser(
    userId: string,
    options: PlannerOptions = {}
  ): Promise<StrategicPlannerData> {
    if (options.fixture === 'demo') {
      return this.analyzeFixture('demo');
    }

    const dataset = await loadLiveDataset(userId, options.guildId);
    return analyzeDataset(dataset);
  }

  static analyzeFixture(name: 'demo' = 'demo'): StrategicPlannerData {
    if (name !== 'demo') {
      throw new Error(`Unsupported fixture: ${name}`);
    }

    return analyzeDataset(getDemoPlatoonReadinessDataset());
  }

  static async getPrimaryGuildForUser(userId: string) {
    return getAccessibleGuild(userId);
  }
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function getNumberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNullableNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function rosterEntryMatchesSlot(
  slot: Record<string, unknown>,
  rosterEntry: Record<string, unknown>,
): boolean {
  const slotUnitBaseId = getStringField(slot, ['unitBaseId']);
  const rosterUnitBaseId = getStringField(rosterEntry, ['unitBaseId', 'baseId', 'defId']);

  if (!slotUnitBaseId || !rosterUnitBaseId || slotUnitBaseId !== rosterUnitBaseId) {
    return false;
  }

  const requiredRarity = getNumberField(slot, ['requiredRarity']);
  const requiredRelicTier = getNumberField(slot, ['requiredRelicTier']);

  const rosterRarity = getNumberField(rosterEntry, [
    'rarity',
    'currentRarity',
    'starCount',
  ]);

  const rosterRelicTier = getNumberField(rosterEntry, [
    'relicTier',
    'currentRelicTier',
  ]);

  if (requiredRarity !== null && (rosterRarity ?? 0) < requiredRarity) {
    return false;
  }

  if (requiredRelicTier !== null && (rosterRelicTier ?? 0) < requiredRelicTier) {
    return false;
  }

  return true;
}

function hydrateSlotsWithEligibleRoster<
  TSlot extends {
    unitBaseId: string;
    requiredRarity: number | null;
    requiredRelicTier: number | null;
  },
  TRoster extends Record<string, unknown>,
>(
  slots: TSlot[],
  roster: TRoster[],
): Array<TSlot & { eligibleRoster: TRoster[] }> {
  const rosterByUnitBaseId = new Map<string, TRoster[]>();

  for (const entry of roster) {
    const unitBaseId = getStringField(entry, ['unitBaseId', 'baseId', 'defId']);
    if (!unitBaseId) continue;

    const list = rosterByUnitBaseId.get(unitBaseId);
    if (list) {
      list.push(entry);
    } else {
      rosterByUnitBaseId.set(unitBaseId, [entry]);
    }
  }

  return slots.map((slot) => {
    const candidates = rosterByUnitBaseId.get(slot.unitBaseId) ?? [];

    const eligibleRoster = candidates.filter((entry) =>
      rosterEntryMatchesSlot(slot as unknown as Record<string, unknown>, entry),
    );

    return {
      ...slot,
      eligibleRoster,
    };
  });
}

export async function loadStrategicPlannerDatasetForGuildSlug(
  slug: string,
): Promise<StrategicPlannerDataset> {
  const guildResult = await sql<{
    id: string;
    name: string;
    slug: string;
    member_count: string | number;
    last_roster_sync: string | null;
  }>`
    SELECT
      g.id,
      g.name,
      g.slug,
      (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) AS member_count,
      (SELECT MAX(last_synced)::text FROM guild_members WHERE guild_id = g.id) AS last_roster_sync
    FROM guilds g
    WHERE g.slug = ${slug}
    LIMIT 1
  `;

  const guildRow = guildResult.rows[0];

  if (!guildRow) {
    return {
      mode: 'live',
      fixtureName: null,
      guild: null,
      reference: null,
      slots: [],
      roster: [],
      members: [],
      strategicAssignments: [],
      permissions: {
        canManageTargets: false,
      },
    };
  }

  const reference = await getReferenceDefinition();
  const members = await loadGuildMembers(guildRow.id);

  if (!reference?.id) {
    return {
      mode: 'live',
      fixtureName: null,
      guild: {
        id: guildRow.id,
        name: guildRow.name,
        slug: guildRow.slug,
        memberCount: toNumber(guildRow.member_count),
        rosteredMembers: 0,
        rosterUnitCount: 0,
        lastRosterSync: guildRow.last_roster_sync,
      },
      reference: null,
      slots: [],
      roster: [],
      members,
      strategicAssignments: await listGuildUpgradeAssignments(guildRow.id),
      permissions: {
        canManageTargets: false,
      },
    };
  }

  const rawSlots = await loadSlotsForReference(reference);
  const unitBaseIds = [...new Set(rawSlots.map((slot) => slot.unitBaseId))];

  const [rawRoster, strategicAssignments, ignoredMemberIds] = await Promise.all([
    loadRosterForUnits(guildRow.id, unitBaseIds),
    listGuildUpgradeAssignments(guildRow.id),
    getIgnoredMemberIds(guildRow.id),
  ]);
const slots = hydrateSlotsWithEligibleRoster(
  rawSlots,
  rawRoster as unknown as Record<string, unknown>[],
);

  const rosteredMemberIds = new Set<string>();
  for (const entry of rawRoster as unknown as Record<string, unknown>[]) {
    const memberId = getStringField(entry, ['memberId', 'playerId']);
    if (memberId) {
      rosteredMemberIds.add(memberId);
    }
  }

  // Filter out ignored members from the member list
  const activeMembers = members.filter(m => !ignoredMemberIds.has(m.memberId));

  const guild: StrategicPlannerGuild = {
    id: guildRow.id,
    name: guildRow.name,
    slug: guildRow.slug,
    memberCount: toNumber(guildRow.member_count),
    rosteredMembers: rosteredMemberIds.size,
    rosterUnitCount: rawRoster.length,
    lastRosterSync: guildRow.last_roster_sync,
  };

  return {
    mode: 'live',
    fixtureName: null,
    guild,
    reference,
    slots,
    roster: rawRoster,
    members: activeMembers,
    strategicAssignments,
    permissions: {
      canManageTargets: false,
    },
  };
}
