/**
 * Platoon Matching Engine — bipartite maximum matching with member capacity constraints.
 *
 * For each (phase, planetCategory) group the engine:
 *   1. Builds a candidate graph: requirement slot → eligible (member, unit) pairs.
 *   2. Finds the maximum valid assignment via augmenting-path search (Kuhn's algorithm).
 *      Capacity constraint: each guild member may fill at most MEMBER_CAP_PER_CATEGORY
 *      slots within a single (phase, category) group.
 *   3. Classifies every unmatched slot as a gap and recommends the cheapest closure.
 *
 * Main categories (LS, DS, MIX) are matched first; bonus zones (SPECIAL) follow
 * in the same pass using their own independent capacity budget.
 *
 * Output types are shaped for three consumers:
 *   - Planner UI        → PlatoonMatchingResult.coverage + assignments
 *   - Public target board → PlatoonMatchingResult.assignments
 *   - Gap panel         → PlatoonMatchingResult.gaps
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

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum platoon slots a single member may fill per category per phase. */
const MEMBER_CAP_PER_CATEGORY = 10;

/**
 * Processing order: main zone categories first, bonus (SPECIAL) last.
 * Within each phase the engine processes categories in this sequence so that
 * main-zone slots receive priority when member capacity is shared implicitly
 * by the sort order of requirements fed into the matching.
 */
const CATEGORY_PROCESSING_ORDER: PlanetCategory[] = ['LS', 'DS', 'MIX', 'SPECIAL'];
const DEBUG_UNITS = new Set([
  'LOGRAY',
  'LUKESKYWALKERFARMBOY',
]);
// ── Internal matching state ───────────────────────────────────────────────────

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

// ── Key helpers ───────────────────────────────────────────────────────────────

function makeOwnerKey(memberId: string, unitBaseId: string): OwnerKey {
  return `${memberId}:${unitBaseId}`;
}

function memberIdFromOwnerKey(key: OwnerKey): string {
  // memberId is a UUID (dashes, no colons); unitBaseId has no colons either.
  const idx = key.indexOf(':');
  return idx === -1 ? key : key.slice(0, idx);
}

// ── Eligibility (mirrors platoon-readiness.ts, kept local to avoid coupling) ──

function ownerQualifies(
  owner: StrategicPlannerRosterInput,
  slot: StrategicPlannerSlotInput,
): boolean {
  if (owner.rarity < slot.requiredRarity) return false;
  // Ship slots have no relic track; unitCategory is the authoritative classifier.
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

// ── Augmenting-path matching ──────────────────────────────────────────────────

/**
 * Attempt to find an augmenting path originating at `reqId`.
 *
 * Classic Kuhn's algorithm extended with a member-capacity guard:
 *   - A free (unmatched) owner can be assigned only when memberId still has
 *     remaining capacity.
 *   - An already-matched owner can be "borrowed" by trying to find an
 *     alternative assignment for the requirement it currently fills (no
 *     capacity change; the member just switches slots).
 *
 * `visitedReqs` prevents the DFS from entering the same requirement twice,
 * ensuring the search terminates.
 *
 * Returns true when `reqId` is successfully (re-)matched; mutates `state`.
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
      // Owner is already filling another slot. Try to displace it by finding
      // an alternative assignment for prevReq (member load stays the same).
      if (!visitedReqs.has(prevReq)) {
        visitedReqs.add(prevReq);
        if (tryMatch(prevReq, eligibleOwners, state, memberCap, visitedReqs)) {
          // prevReq found a new owner; oKey is now free for reqId.
          state.reqToOwner.set(reqId, oKey);
          state.ownerToReq.set(oKey, reqId); // overwrites stale prevReq reference
          return true;
        }
      }
    } else {
      // Owner is free. Assign directly if the member still has capacity.
      const load = state.memberLoad.get(memberId) ?? 0;
      if (load < memberCap) {
        state.reqToOwner.set(reqId, oKey);
        state.ownerToReq.set(oKey, reqId);
        state.memberLoad.set(memberId, load + 1);
        return true;
      }
      // Member at capacity — capacity-freeing augmentation (augmenting through
      // the member's other assignments) is omitted here; it is rarely needed
      // in practice because the cap of 10 exceeds typical per-phase unit demand.
    }
  }

  return false;
}

// ── Group matching ────────────────────────────────────────────────────────────

/**
 * Run maximum bipartite matching for all slots in one (phase, category) group.
 *
 * Slots are processed strictest-first so that slots with fewer eligible owners
 * get first pick; within each slot, candidate owners are tried weakest-first
 * (preserving high-relic owners for slots that truly need them).
 */
function runMatchingForGroup(
  slots: StrategicPlannerSlotInput[],
  rosterByUnit: ReadonlyMap<string, StrategicPlannerRosterInput[]>,
): MatchingState {
  // Build per-slot eligible owner lists (weakest qualifying owner first).
  const eligibleOwners = new Map<string, OwnerKey[]>();
  for (const slot of slots) {
    const candidates = rosterByUnit.get(slot.unitBaseId) ?? [];
    eligibleOwners.set(
      slot.slotKey,
      candidates
        .filter((o) => ownerQualifies(o, slot))
        .sort((a, b) => {
          if (a.relicTier !== b.relicTier) return a.relicTier - b.relicTier;
          if (a.rarity !== b.rarity) return a.rarity - b.rarity;
          return a.playerName.localeCompare(b.playerName);
        })
        .map((o) => makeOwnerKey(o.memberId, o.unitBaseId)),
    );
  }

  // Process requirements strictest-first (hardest slot gets priority pick).
  const sortedSlots = [...slots].sort((a, b) => {
    if (b.requiredRelicTier !== a.requiredRelicTier)
      return b.requiredRelicTier - a.requiredRelicTier;
    if (b.requiredRarity !== a.requiredRarity) return b.requiredRarity - a.requiredRarity;
    if (a.phase !== b.phase) return a.phase - b.phase;
    if (a.zoneSortOrder !== b.zoneSortOrder) return a.zoneSortOrder - b.zoneSortOrder;
    if (a.platoonSortOrder !== b.platoonSortOrder) return a.platoonSortOrder - b.platoonSortOrder;
    return a.slotNumber - b.slotNumber;
  });

  const state: MatchingState = {
    reqToOwner: new Map(),
    ownerToReq: new Map(),
    memberLoad: new Map(),
  };

  for (const slot of sortedSlots) {
    // Seed visited with the current requirement so the DFS cannot return to it.
    const visited = new Set<string>([slot.slotKey]);
    tryMatch(slot.slotKey, eligibleOwners, state, MEMBER_CAP_PER_CATEGORY, visited);
  }

  return state;
}

// ── Gap analysis ──────────────────────────────────────────────────────────────

/**
 * For every unmatched slot determine the cheapest closure path.
 *
 * Priority (from task spec):
 *   1. use_unused  — eligible owner exists with remaining capacity (not matched due to
 *                    capacity-freeing limitation; extremely rare after a full matching pass).
 *   2. reassign    — eligible owner was matched elsewhere; this slot needs a real trade-off.
 *   3. upgrade     — near-miss owner exists (≤ 2 relic tiers, ≤ 1 rarity short).
 *   4. acquire     — no owner qualifies or approaches qualification.
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
      if (DEBUG_UNITS.has(slot.unitBaseId)) {
        const assignedReq = state.ownerToReq.get(oKey);

        console.log('[matching:gap-candidate]', {
          gapSlot: slot.slotKey,
          gapUnit: slot.unitBaseId,
          gapUnitName: slot.unitName,

          candidateMember: owner.memberId,
          playerName,

          relic: owner.relicTier,
          rarity: owner.rarity,

          qualifies: ownerQualifies(owner, slot),
          nearMiss: isNearMiss(owner, slot),

          alreadyAssigned: state.ownerToReq.has(oKey),
          assignedSlot: assignedReq ?? null,

          memberLoad: state.memberLoad.get(owner.memberId) ?? 0,
          atCap:
            (state.memberLoad.get(owner.memberId) ?? 0) >= MEMBER_CAP_PER_CATEGORY,
        });
      }
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
      } else if (isNearMiss(owner, slot)) {
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

    // Sort near-miss sources easiest-upgrade-first.
    nearMissSources.sort(
      (a, b) => a.missingRelicTiers - b.missingRelicTiers || a.missingRarity - b.missingRarity,
    );

    let recommendedAction: GapActionType;
    let possibleSources: GapPossibleSource[];

    if (freeEligible.length > 0) {
      recommendedAction = 'use_unused';
      possibleSources = freeEligible;
    } else if (busyEligible.length > 0) {
      recommendedAction = 'reassign';
      possibleSources = busyEligible;
    } else if (nearMissSources.length > 0) {
      recommendedAction = 'upgrade';
      possibleSources = nearMissSources;
    } else {
      recommendedAction = 'acquire';
      possibleSources = [];
    }
    if (DEBUG_UNITS.has(slot.unitBaseId)) {
      console.log('[matching:gap-result]', {
        slotKey: slot.slotKey,
        unit: slot.unitBaseId,
        action: recommendedAction,

        freeEligible: freeEligible.map((s) => s.playerName),

        busyEligible: busyEligible.map((s) => s.playerName),

        nearMiss: nearMissSources.map((s) => ({
          player: s.playerName,
          relic: s.missingRelicTiers,
          rarity: s.missingRarity,
        })),
      });
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

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Compute the maximal valid assignment of guild characters to platoon slots
 * for all phases (1–6) and all planet categories.
 *
 * Algorithm per (phase, category) group:
 *   - Main zones (LS, DS, MIX): full capacity budget (10 per member).
 *   - Bonus zones (SPECIAL): independent capacity budget (10 per member),
 *     processed after main zones in each phase.
 *
 * The function is pure (no I/O, no side effects) and runs in O(R × M × U)
 * time where R = requirement count, M = member count, U = max owners per unit.
 */
export function computePlatoonMatching(dataset: StrategicPlannerDataset): PlatoonMatchingResult {
  const { slots, roster, members } = dataset;

  // ── Indexes built once and reused across groups ──────────────────────────

  /** memberId → playerName (preferred over roster.playerName for consistency). */
  const memberNameMap = new Map<string, string>(
    members.map((m) => [m.memberId, m.playerName]),
  );

  /** unitBaseId → all roster entries owning that unit. */
  const rosterByUnit = new Map<string, StrategicPlannerRosterInput[]>();
  for (const entry of roster) {
    let list = rosterByUnit.get(entry.unitBaseId);
    if (!list) {
      list = [];
      rosterByUnit.set(entry.unitBaseId, list);
    }
    list.push(entry);
  }

  // Distinct phases in ascending order.
  const phases = [...new Set(slots.map((s) => s.phase))].sort((a, b) => a - b);

  // ── Per-group matching ────────────────────────────────────────────────────

  const allCoverage: PlatoonMatchingCoverage[] = [];
  const allAssignments: PlatoonMatchingAssignment[] = [];
  const allGaps: PlatoonMatchingGap[] = [];

  for (const phase of phases) {
    const phaseSlots = slots.filter((s) => s.phase === phase);

    for (const category of CATEGORY_PROCESSING_ORDER) {
      const group = phaseSlots.filter((s) => s.planetCategory === category);
      if (group.length === 0) continue;

      const state = runMatchingForGroup(group, rosterByUnit);

      // ── Coverage summary ─────────────────────────────────────────────────
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

      // ── Assignments ──────────────────────────────────────────────────────
      const slotIndex = new Map(group.map((s) => [s.slotKey, s]));
      
      for (const [reqId, oKey] of state.reqToOwner) {
        const slot = slotIndex.get(reqId);
        if (!slot) continue;
        const memberId = memberIdFromOwnerKey(oKey);
            console.log('[matching:assignment]', {
              slot: reqId,
              unit: slot.unitBaseId,
              unitName: slot.unitName,
              member: memberId,
              playerName: memberNameMap.get(memberId) ?? memberId,
            });
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

      // ── Gap analysis ─────────────────────────────────────────────────────
      const unmatched = group.filter((s) => !state.reqToOwner.has(s.slotKey));
      allGaps.push(...buildGaps(unmatched, rosterByUnit, memberNameMap, state));
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalRequired = allCoverage.reduce((n, c) => n + c.requirementCount, 0);
  const totalAssigned = allCoverage.reduce((n, c) => n + c.assignedCount, 0);
    console.log('[matching:summary]', {
      totalAssignments: allAssignments.length,
      totalGaps: allGaps.length,
      sampleGaps: allGaps.slice(0, 10).map((g) => ({
        slotKey: g.requirementId,
        unitBaseId: g.unitBaseId,
        unitName: g.unitName,
        action: g.recommendedAction,
      })),
    });
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
