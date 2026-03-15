/**
 * Platoon Matching Engine — bipartite maximum matching with member capacity constraints.
 *
 * For each (phase, planetCategory) group the engine:
 *   1. Builds a candidate graph: requirement slot → eligible (member, unit) pairs.
 *   2. Finds the maximum valid assignment via augmenting-path search (Kuhn's algorithm).
 *      Capacity constraint: each guild member may fill at most MEMBER_CAP_PER_CATEGORY
 *      slots within a single (phase, category) group.
 *   3. Classifies every unmatched slot as a gap and recommends the cheapest net closure.
 *
 * Main categories (LS, DS, MIX) are matched first; bonus zones (SPECIAL) follow
 * in the same pass using their own independent capacity budget.
 *
 * Important semantics:
 *   - "reassign" is intentionally NOT emitted as a recommended action here unless
 *     true net-positive reassignment feasibility is proven.
 *   - A qualified owner who is already committed elsewhere does not close the gap;
 *     it merely moves the gap. Those owners are still exposed in possibleSources
 *     for operator context, but they do not drive recommendedAction.
 *
 * Output types are shaped for three consumers:
 *   - Planner UI          → PlatoonMatchingResult.coverage + assignments
 *   - Public target board → PlatoonMatchingResult.assignments
 *   - Gap panel           → PlatoonMatchingResult.gaps
 */

import type {
  GapActionType,
  GapPossibleSource,
  PlanetCategory,
  PlatoonMatchingAssignment,
  PlatoonMatchingCoverage,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
  StrategicPlannerDataset,
  StrategicPlannerRosterInput,
  StrategicPlannerSlotInput,
} from '@/lib/types/platoon-readiness';

// Re-export so callers can import from either location.
export type {
  GapActionType,
  GapPossibleSource,
  PlatoonMatchingAssignment,
  PlatoonMatchingCoverage,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
};

/** Maximum platoon slots a single member may fill per category per phase. */
const MEMBER_CAP_PER_CATEGORY = 10;

/**
 * Processing order: main zone categories first, bonus (SPECIAL) last.
 */
const CATEGORY_PROCESSING_ORDER: PlanetCategory[] = ['LS', 'DS', 'MIX', 'SPECIAL'];

/** `${memberId}:${unitBaseId}` — uniquely identifies one character instance. */
type OwnerKey = string;

interface MatchingState {
  /** slotKey → OwnerKey currently filling it. */
  reqToOwner: Map<string, OwnerKey>;
  /** OwnerKey → slotKey it is currently filling. */
  ownerToReq: Map<OwnerKey, string>;
  /** memberId → number of slots currently assigned in this group. */
  memberLoad: Map<string, number>;
}

function makeOwnerKey(memberId: string, unitBaseId: string): OwnerKey {
  return `${memberId}:${unitBaseId}`;
}

function memberIdFromOwnerKey(key: OwnerKey): string {
  const idx = key.indexOf(':');
  return idx === -1 ? key : key.slice(0, idx);
}

function ownerQualifies(
  owner: StrategicPlannerRosterInput,
  slot: StrategicPlannerSlotInput,
): boolean {
  if (owner.rarity < slot.requiredRarity) return false;
  if (slot.unitCategory === 'SHIP') return true;
  return owner.relicTier >= slot.requiredRelicTier;
}

function isNearMiss(
  owner: StrategicPlannerRosterInput,
  slot: StrategicPlannerSlotInput,
): boolean {
  const relicDeficit =
    slot.unitCategory === 'SHIP'
      ? 0
      : Math.max(slot.requiredRelicTier - owner.relicTier, 0);

  const rarityDeficit = Math.max(slot.requiredRarity - owner.rarity, 0);

  return (relicDeficit > 0 || rarityDeficit > 0) && relicDeficit <= 2 && rarityDeficit <= 1;
}

function getDeficits(
  owner: StrategicPlannerRosterInput,
  slot: StrategicPlannerSlotInput,
): { missingRelicTiers: number; missingRarity: number } {
  return {
    missingRelicTiers:
      slot.unitCategory === 'SHIP'
        ? 0
        : Math.max(slot.requiredRelicTier - owner.relicTier, 0),
    missingRarity: Math.max(slot.requiredRarity - owner.rarity, 0),
  };
}

/**
 * Attempt to find an augmenting path originating at `reqId`.
 */
function tryMatch(
  reqId: string,
  eligibleOwners: ReadonlyMap<string, OwnerKey[]>,
  state: MatchingState,
  memberCap: number,
  visitedReqs: Set<string>,
): boolean {
  for (const oKey of eligibleOwners.get(reqId) ?? []) {
    const memberId = memberIdFromOwnerKey(oKey);
    const prevReq = state.ownerToReq.get(oKey);

    if (prevReq !== undefined) {
      if (!visitedReqs.has(prevReq)) {
        visitedReqs.add(prevReq);
        if (tryMatch(prevReq, eligibleOwners, state, memberCap, visitedReqs)) {
          state.reqToOwner.set(reqId, oKey);
          state.ownerToReq.set(oKey, reqId);
          return true;
        }
      }
    } else {
      const load = state.memberLoad.get(memberId) ?? 0;
      if (load < memberCap) {
        state.reqToOwner.set(reqId, oKey);
        state.ownerToReq.set(oKey, reqId);
        state.memberLoad.set(memberId, load + 1);
        return true;
      }
    }
  }

  return false;
}

/**
 * Run maximum bipartite matching for all slots in one (phase, category) group.
 */
function runMatchingForGroup(
  slots: StrategicPlannerSlotInput[],
  rosterByUnit: ReadonlyMap<string, StrategicPlannerRosterInput[]>,
): MatchingState {
  const eligibleOwners = new Map<string, OwnerKey[]>();

  for (const slot of slots) {
    const candidates = rosterByUnit.get(slot.unitBaseId) ?? [];
    eligibleOwners.set(
      slot.slotKey,
      candidates
        .filter((owner) => ownerQualifies(owner, slot))
        .sort((left, right) => {
          if (left.relicTier !== right.relicTier) return left.relicTier - right.relicTier;
          if (left.rarity !== right.rarity) return left.rarity - right.rarity;
          return left.playerName.localeCompare(right.playerName);
        })
        .map((owner) => makeOwnerKey(owner.memberId, owner.unitBaseId)),
    );
  }

  const sortedSlots = [...slots].sort((left, right) => {
    if (right.requiredRelicTier !== left.requiredRelicTier) {
      return right.requiredRelicTier - left.requiredRelicTier;
    }
    if (right.requiredRarity !== left.requiredRarity) {
      return right.requiredRarity - left.requiredRarity;
    }
    if (left.phase !== right.phase) return left.phase - right.phase;
    if (left.zoneSortOrder !== right.zoneSortOrder) {
      return left.zoneSortOrder - right.zoneSortOrder;
    }
    if (left.platoonSortOrder !== right.platoonSortOrder) {
      return left.platoonSortOrder - right.platoonSortOrder;
    }
    return left.slotNumber - right.slotNumber;
  });

  const state: MatchingState = {
    reqToOwner: new Map(),
    ownerToReq: new Map(),
    memberLoad: new Map(),
  };

  for (const slot of sortedSlots) {
    const visited = new Set<string>([slot.slotKey]);
    tryMatch(slot.slotKey, eligibleOwners, state, MEMBER_CAP_PER_CATEGORY, visited);
  }

  return state;
}

/**
 * For every unmatched slot determine the cheapest net closure path.
 *
 * Priority:
 *   1. use_unused — eligible owner exists with remaining capacity and no current assignment.
 *   2. upgrade    — near-miss owner exists (≤ 2 relic tiers, ≤ 1 rarity short).
 *   3. acquire    — no owner qualifies or approaches qualification.
 *
 * Note:
 *   Owners that qualify but are already committed elsewhere are kept in possibleSources
 *   for operator context, but they do not trigger "reassign" as recommendedAction.
 */
function buildGaps(
  unmatched: StrategicPlannerSlotInput[],
  rosterByUnit: ReadonlyMap<string, StrategicPlannerRosterInput[]>,
  memberNameMap: ReadonlyMap<string, string>,
  state: MatchingState,
): PlatoonMatchingGap[] {
  return unmatched.map((slot): PlatoonMatchingGap => {
    const owners = rosterByUnit.get(slot.unitBaseId) ?? [];

    const freeEligible: GapPossibleSource[] = [];
    const busyEligible: GapPossibleSource[] = [];
    const nearMissSources: GapPossibleSource[] = [];

    for (const owner of owners) {
      const oKey = makeOwnerKey(owner.memberId, owner.unitBaseId);
      const playerName = memberNameMap.get(owner.memberId) ?? owner.playerName;

      if (ownerQualifies(owner, slot)) {
        const source: GapPossibleSource = {
          memberId: owner.memberId,
          playerName,
          kind: 'eligible',
          missingRelicTiers: 0,
          missingRarity: 0,
        };

        const isMatched = state.ownerToReq.has(oKey);
        const isAtCap =
          (state.memberLoad.get(owner.memberId) ?? 0) >= MEMBER_CAP_PER_CATEGORY;

        if (!isMatched && !isAtCap) {
          freeEligible.push(source);
        } else {
          busyEligible.push(source);
        }

        continue;
      }

      if (isNearMiss(owner, slot)) {
        const { missingRelicTiers, missingRarity } = getDeficits(owner, slot);
        nearMissSources.push({
          memberId: owner.memberId,
          playerName,
          kind: 'near_miss',
          missingRelicTiers,
          missingRarity,
        });
      }
    }

    nearMissSources.sort(
      (left, right) =>
        left.missingRelicTiers - right.missingRelicTiers ||
        left.missingRarity - right.missingRarity,
    );

    let recommendedAction: GapActionType;
    let possibleSources: GapPossibleSource[];

    if (freeEligible.length > 0) {
      recommendedAction = 'use_unused';
      possibleSources = freeEligible;
    } else if (nearMissSources.length > 0) {
      recommendedAction = 'upgrade';
      possibleSources = nearMissSources;
    } else {
      recommendedAction = 'acquire';
      possibleSources = busyEligible;
    }

    return {
      requirementId: slot.slotKey,
      phase: slot.phase,
      zoneKey: slot.zoneKey,
      platoonKey: slot.platoonKey,
      slotNumber: slot.slotNumber,
      unitBaseId: slot.unitBaseId,
      unitName: slot.unitName,
      minRelic: slot.requiredRelicTier,
      minRarity: slot.requiredRarity,
      planetCategory: slot.planetCategory,
      isBonus: slot.planetCategory === 'SPECIAL',
      possibleSources,
      recommendedAction,
    };
  });
}

/**
 * Compute the maximal valid assignment of guild characters to platoon slots
 * for all phases and all planet categories.
 */
export function computePlatoonMatching(dataset: StrategicPlannerDataset): PlatoonMatchingResult {
  const { slots, roster, members } = dataset;

  const memberNameMap = new Map<string, string>(
    members.map((member) => [member.memberId, member.playerName]),
  );

  const rosterByUnit = new Map<string, StrategicPlannerRosterInput[]>();
  for (const entry of roster) {
    const existing = rosterByUnit.get(entry.unitBaseId);
    if (existing) {
      existing.push(entry);
    } else {
      rosterByUnit.set(entry.unitBaseId, [entry]);
    }
  }

  const phases = [...new Set(slots.map((slot) => slot.phase))].sort((left, right) => left - right);

  const allCoverage: PlatoonMatchingCoverage[] = [];
  const allAssignments: PlatoonMatchingAssignment[] = [];
  const allGaps: PlatoonMatchingGap[] = [];

  for (const phase of phases) {
    const phaseSlots = slots.filter((slot) => slot.phase === phase);

    for (const category of CATEGORY_PROCESSING_ORDER) {
      const group = phaseSlots.filter((slot) => slot.planetCategory === category);
      if (group.length === 0) continue;

      const state = runMatchingForGroup(group, rosterByUnit);

      const assignedCount = state.reqToOwner.size;
      const requirementCount = group.length;

      allCoverage.push({
        phase,
        category,
        isBonus: category === 'SPECIAL',
        assignedCount,
        requirementCount,
        coveragePercent:
          requirementCount > 0 ? Math.round((assignedCount / requirementCount) * 100) : 100,
      });

      const slotIndex = new Map(group.map((slot) => [slot.slotKey, slot]));

      for (const [reqId, oKey] of state.reqToOwner) {
        const slot = slotIndex.get(reqId);
        if (!slot) continue;

        const memberId = memberIdFromOwnerKey(oKey);

        allAssignments.push({
          requirementId: reqId,
          phase: slot.phase,
          zoneKey: slot.zoneKey,
          platoonKey: slot.platoonKey,
          slotNumber: slot.slotNumber,
          unitBaseId: slot.unitBaseId,
          unitName: slot.unitName,
          memberId,
          playerName: memberNameMap.get(memberId) ?? memberId,
        });
      }

      const unmatched = group.filter((slot) => !state.reqToOwner.has(slot.slotKey));
      allGaps.push(...buildGaps(unmatched, rosterByUnit, memberNameMap, state));
    }
  }

  const totalRequired = allCoverage.reduce((sum, entry) => sum + entry.requirementCount, 0);
  const totalAssigned = allCoverage.reduce((sum, entry) => sum + entry.assignedCount, 0);

  return {
    coverage: allCoverage,
    assignments: allAssignments,
    gaps: allGaps,
    totalAssigned,
    totalRequired,
    coveragePercent:
      totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 100,
  };
}