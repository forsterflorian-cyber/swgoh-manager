import { sql } from '@vercel/postgres';

import { getDemoPlatoonReadinessDataset } from '@/lib/services/platoon-readiness-fixture';
import type {
  StrategicPlannerData,
  StrategicPlannerDataset,
  StrategicPlannerGuild,
  StrategicPlannerReference,
  StrategicPlannerRosterInput,
  StrategicPlannerSlotInput,
  StrategicPlatoonStatus,
  StrategicRequirementSummary,
  StrategicUnitImpact,
  StrategicZoneReadiness,
} from '@/lib/types/platoon-readiness';
import { toNumber } from '@/lib/utils/to-number';

type AccessibleGuildRow = {
  id: string;
  name: string;
  slug: string;
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
};

type RosterRow = {
  member_id: string;
  ally_code: string;
  player_name: string;
  unit_base_id: string;
  unit_name: string;
  relic_tier: string | number | null;
  rarity: string | number | null;
};

type PlannerOptions = {
  guildId?: string;
  fixture?: string | null;
};

type UnitAllocation = {
  unitBaseId: string;
  unitName: string;
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

function buildEmptyPlannerData(input: {
  mode: 'live' | 'fixture';
  fixtureName?: string | null;
  guild?: StrategicPlannerGuild | null;
  reference?: StrategicPlannerReference | null;
  recommendedActions: string[];
}): StrategicPlannerData {
  return {
    mode: input.mode,
    fixtureName: input.fixtureName ?? null,
    generatedAt: new Date().toISOString(),
    guild: input.guild ?? null,
    reference: input.reference ?? null,
    summary: null,
    topMissingUnits: [],
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
  };
}

function ownerKey(owner: StrategicPlannerRosterInput) {
  return owner.memberId;
}

function qualifies(owner: StrategicPlannerRosterInput, slot: StrategicPlannerSlotInput) {
  return owner.relicTier >= slot.requiredRelicTier && owner.rarity >= slot.requiredRarity;
}

function getDeficits(owner: StrategicPlannerRosterInput, slot: StrategicPlannerSlotInput) {
  return {
    relicDeficit: Math.max(slot.requiredRelicTier - owner.relicTier, 0),
    rarityDeficit: Math.max(slot.requiredRarity - owner.rarity, 0),
  };
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

  return {
    unitBaseId: firstRequirement?.unitBaseId ?? 'UNKNOWN',
    unitName: firstRequirement?.unitName ?? firstRequirement?.unitBaseId ?? 'Unknown Unit',
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
  impact: Omit<StrategicUnitImpact, 'impactScore' | 'reasonSummary'>
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
  impact: Omit<StrategicUnitImpact, 'impactScore' | 'reasonSummary'>
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

  const impactWithoutScore = {
    unitBaseId: allocation.unitBaseId,
    unitName: allocation.unitName,
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
  const topMissingUnits = overallUnitAllocations
    .map((allocation) =>
      toImpact(allocation, {
        zones: limitingZoneCounts.get(allocation.unitBaseId) ?? 0,
        platoons: limitingPlatoonCounts.get(allocation.unitBaseId) ?? 0,
      })
    )
    .filter((impact) => impact.missingSlots > 0)
    .sort(sortImpacts);

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
    topMissingUnits,
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

async function loadSlotsForReference(referenceId: string): Promise<StrategicPlannerSlotInput[]> {
  const result = await sql<SlotRow>`
    SELECT
      tp.phase_number,
      tz.zone_key,
      tz.name AS zone_name,
      tz.sort_order AS zone_sort_order,
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
    WHERE tp.tb_definition_id = ${referenceId}
    ORDER BY tp.phase_number ASC, tz.sort_order ASC, tpl.sort_order ASC, tps.slot_number ASC
  `;

  return result.rows.map((row) => ({
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
    requiredRelicTier: toNumber(row.required_relic_tier),
    requiredRarity: toNumber(row.required_rarity, 7),
  }));
}

async function loadRosterForUnits(
  guildId: string,
  unitBaseIds: string[]
): Promise<StrategicPlannerRosterInput[]> {
  if (unitBaseIds.length === 0) {
    return [];
  }

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
       AND gm.guild_id = rc.guild_id
      WHERE rc.guild_id = $1
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
    };
  }

  const slots = await loadSlotsForReference(reference.id);
  const unitBaseIds = [...new Set(slots.map((slot) => slot.unitBaseId))];
  const roster = await loadRosterForUnits(guildRow.id, unitBaseIds);

  return {
    mode: 'live',
    fixtureName: null,
    guild,
    reference,
    slots,
    roster,
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
