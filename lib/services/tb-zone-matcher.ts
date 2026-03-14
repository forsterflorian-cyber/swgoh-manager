/**
 * tb-zone-matcher.ts
 *
 * Pure, in-memory zone-level slot assignment engine.
 * No database calls — all I/O happens in the caller (tb-planning.ts).
 *
 * Rules enforced here:
 *   - LOCKED assignments are fixed; their slots are skipped entirely.
 *   - Each member may receive at most `maxPerMember` FLEX proposals in a zone (default 10).
 *   - A member may not be assigned the same unit twice in the same phase
 *     (checked via `phaseUnitKeys`, which covers assignments in other zones).
 *   - Slots with fewest qualified candidates are processed first (scarcity-first).
 *   - Output is deterministic: same inputs always produce the same proposals.
 *   - Single-level rebalancing: if all qualified candidates for a slot are at
 *     zone capacity, the engine tries to move one of their existing FLEX proposals
 *     to an alternative member, freeing a slot for the blocked candidate.
 */

export const MAX_ASSIGNMENTS_PER_MEMBER_PER_ZONE = 10;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MatcherSlot {
  slotId: string;
  unitBaseId: string;
  /** 0 for ships (no relic track). */
  minRelic: number;
  minRarity: number;
}

export interface MatcherRosterEntry {
  memberId: string;
  allyCode: string;
  playerName: string;
  relicTier: number;
  rarity: number;
}

/** A LOCKED assignment that the matcher must leave untouched. */
export interface MatcherLockedAssignment {
  slotId: string;
  memberId: string;
  allyCode: string;
  unitBaseId: string;
}

/** A FLEX assignment proposed by the engine. */
export interface MatcherProposal {
  slotId: string;
  unitBaseId: string;
  memberId: string;
  allyCode: string;
  playerName: string;
  relicTier: number;
  rarity: number;
}

export type OpenSlotReason = 'no_eligible_member' | 'eligible_at_capacity';

export interface MatcherOpenSlot {
  slotId: string;
  unitBaseId: string;
  reason: OpenSlotReason;
}

export interface ZoneMatchResult {
  /** FLEX proposals for open (non-LOCKED) slots. */
  proposals: MatcherProposal[];
  /** Slots the engine could not fill even after rebalancing. */
  openSlots: MatcherOpenSlot[];
  /**
   * Total filled slots after matching:
   * lockedAssignments.length + proposals.length
   */
  filledCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qualifies(entry: MatcherRosterEntry, slot: MatcherSlot): boolean {
  return entry.relicTier >= slot.minRelic && entry.rarity >= slot.minRarity;
}

/**
 * Lower score = preferred candidate.
 * Deterministic tiebreaker: callers sort by (score ASC, allyCode ASC).
 */
function computeScore(entry: MatcherRosterEntry, lockedZoneCount: number): number {
  // Prefer lightly loaded members; within same load prefer higher relic tier.
  return lockedZoneCount * 10 - entry.relicTier;
}

// ---------------------------------------------------------------------------
// matchZone
// ---------------------------------------------------------------------------

/**
 * @param slots            All slots in the zone (LOCKED slots are skipped internally).
 * @param rosterByUnit     Guild roster keyed by unitBaseId.
 * @param lockedAssignments  LOCKED assignments for this zone (must not be moved).
 * @param phaseUnitKeys    `${allyCode}:${unitBaseId}` occupied in OTHER zones of the
 *                         same phase. Prevents dual-use of a unit across zones.
 * @param maxPerMember     Max total (LOCKED + FLEX) assignments per member in this zone.
 */
export function matchZone(
  slots: MatcherSlot[],
  rosterByUnit: Map<string, MatcherRosterEntry[]>,
  lockedAssignments: MatcherLockedAssignment[],
  phaseUnitKeys: Set<string>,
  maxPerMember: number = MAX_ASSIGNMENTS_PER_MEMBER_PER_ZONE
): ZoneMatchResult {
  // ── slot lookup (needed for rebalancing) ────────────────────────────────
  const slotById = new Map<string, MatcherSlot>();
  for (const s of slots) slotById.set(s.slotId, s);

  // ── initialise capacity and occupied-unit tracking ──────────────────────
  // remaining[memberId] = how many more zone assignments this member may receive
  const remaining = new Map<string, number>();

  // occupied tracks `${allyCode}:${unitBaseId}` across the whole phase
  // (starts with other-zone occupations, we add this zone's locked + proposals)
  const occupied = new Set<string>(phaseUnitKeys);

  const lockedSlotIds = new Set<string>();
  for (const locked of lockedAssignments) {
    lockedSlotIds.add(locked.slotId);
    remaining.set(locked.memberId, (remaining.get(locked.memberId) ?? maxPerMember) - 1);
    occupied.add(`${locked.allyCode}:${locked.unitBaseId}`);
  }

  const getRem = (memberId: string) => remaining.get(memberId) ?? maxPerMember;
  const useRem = (memberId: string) => remaining.set(memberId, getRem(memberId) - 1);
  const freeRem = (memberId: string) => remaining.set(memberId, getRem(memberId) + 1);

  // ── per-slot candidate lists ─────────────────────────────────────────────
  type SlotWork = {
    slot: MatcherSlot;
    /** All qualified members, sorted by (score ASC, allyCode ASC). */
    candidates: MatcherRosterEntry[];
  };

  const openWork: SlotWork[] = [];
  for (const slot of slots) {
    if (lockedSlotIds.has(slot.slotId)) continue;

    const roster = rosterByUnit.get(slot.unitBaseId) ?? [];
    const candidates: MatcherRosterEntry[] = [];
    for (const entry of roster) {
      if (qualifies(entry, slot)) candidates.push(entry);
    }

    // Score uses locked zone load only (proposals not yet made — consistent baseline).
    candidates.sort((a, b) => {
      const loadA = maxPerMember - (remaining.get(a.memberId) ?? maxPerMember);
      const loadB = maxPerMember - (remaining.get(b.memberId) ?? maxPerMember);
      const diff = computeScore(a, loadA) - computeScore(b, loadB);
      return diff !== 0 ? diff : a.allyCode.localeCompare(b.allyCode);
    });

    openWork.push({ slot, candidates });
  }

  // ── scarcity-first sort ──────────────────────────────────────────────────
  openWork.sort(
    (a, b) =>
      a.candidates.length - b.candidates.length ||
      a.slot.slotId.localeCompare(b.slot.slotId)
  );

  // ── greedy pass ──────────────────────────────────────────────────────────
  const proposals: MatcherProposal[] = [];
  const deferred: SlotWork[] = [];

  for (const { slot, candidates } of openWork) {
    let filled = false;
    for (const entry of candidates) {
      if (getRem(entry.memberId) <= 0) continue;
      const unitKey = `${entry.allyCode}:${slot.unitBaseId}`;
      if (occupied.has(unitKey)) continue;

      proposals.push({
        slotId: slot.slotId,
        unitBaseId: slot.unitBaseId,
        memberId: entry.memberId,
        allyCode: entry.allyCode,
        playerName: entry.playerName,
        relicTier: entry.relicTier,
        rarity: entry.rarity,
      });
      useRem(entry.memberId);
      occupied.add(unitKey);
      filled = true;
      break;
    }
    if (!filled) deferred.push({ slot, candidates });
  }

  // ── single-level rebalancing for deferred slots ──────────────────────────
  //
  // For each unresolved slot:
  //   1. Find a qualified member who is at zone capacity (blockedMember).
  //   2. Look through blockedMember's current FLEX proposals.
  //   3. For each of those proposals (toMove), find an alternative member
  //      who also qualifies for toMove's slot and still has capacity.
  //   4. If found: redirect toMove to the alternative, freeing one slot for
  //      blockedMember, then assign blockedMember to the originally blocked slot.
  //
  const openSlots: MatcherOpenSlot[] = [];

  for (const { slot, candidates } of deferred) {
    if (candidates.length === 0) {
      openSlots.push({ slotId: slot.slotId, unitBaseId: slot.unitBaseId, reason: 'no_eligible_member' });
      continue;
    }

    // Fast path: capacity might have been freed by an earlier rebalance.
    let filledByFastPath = false;
    for (const entry of candidates) {
      const unitKey = `${entry.allyCode}:${slot.unitBaseId}`;
      if (getRem(entry.memberId) <= 0) continue;
      if (occupied.has(unitKey)) continue;
      proposals.push({
        slotId: slot.slotId,
        unitBaseId: slot.unitBaseId,
        memberId: entry.memberId,
        allyCode: entry.allyCode,
        playerName: entry.playerName,
        relicTier: entry.relicTier,
        rarity: entry.rarity,
      });
      useRem(entry.memberId);
      occupied.add(unitKey);
      filledByFastPath = true;
      break;
    }
    if (filledByFastPath) continue;

    // Rebalancing attempt.
    let rebalanced = false;

    outer: for (const blockedMember of candidates) {
      // Only try members who ARE at capacity (otherwise fast path above would have caught them).
      if (getRem(blockedMember.memberId) > 0) continue;

      // The unit this member would bring to the blocked slot.
      const blockedUnitKey = `${blockedMember.allyCode}:${slot.unitBaseId}`;
      if (occupied.has(blockedUnitKey)) continue; // already used in this phase

      // Find one of this member's FLEX proposals we can hand off to someone else.
      for (let pi = 0; pi < proposals.length; pi++) {
        const toMove = proposals[pi];
        if (toMove.memberId !== blockedMember.memberId) continue;

        const toMoveSlot = slotById.get(toMove.slotId);
        if (!toMoveSlot) continue;

        const altRoster = rosterByUnit.get(toMoveSlot.unitBaseId) ?? [];
        for (const alt of altRoster) {
          if (alt.memberId === blockedMember.memberId) continue;
          if (!qualifies(alt, toMoveSlot)) continue;
          if (getRem(alt.memberId) <= 0) continue;
          const altUnitKey = `${alt.allyCode}:${toMoveSlot.unitBaseId}`;
          if (occupied.has(altUnitKey)) continue;

          // ── perform the swap ──────────────────────────────────────────
          // 1. Free toMove from blockedMember
          freeRem(blockedMember.memberId);
          occupied.delete(`${blockedMember.allyCode}:${toMoveSlot.unitBaseId}`);

          // 2. Assign toMove to alt
          proposals[pi] = {
            slotId: toMoveSlot.slotId,
            unitBaseId: toMoveSlot.unitBaseId,
            memberId: alt.memberId,
            allyCode: alt.allyCode,
            playerName: alt.playerName,
            relicTier: alt.relicTier,
            rarity: alt.rarity,
          };
          useRem(alt.memberId);
          occupied.add(altUnitKey);

          // 3. Assign the blocked slot to blockedMember (now has +1 capacity)
          proposals.push({
            slotId: slot.slotId,
            unitBaseId: slot.unitBaseId,
            memberId: blockedMember.memberId,
            allyCode: blockedMember.allyCode,
            playerName: blockedMember.playerName,
            relicTier: blockedMember.relicTier,
            rarity: blockedMember.rarity,
          });
          useRem(blockedMember.memberId);
          occupied.add(blockedUnitKey);

          rebalanced = true;
          break outer;
        }
      }
    }

    if (!rebalanced) {
      openSlots.push({
        slotId: slot.slotId,
        unitBaseId: slot.unitBaseId,
        reason: 'eligible_at_capacity',
      });
    }
  }

  return {
    proposals,
    openSlots,
    filledCount: lockedAssignments.length + proposals.length,
  };
}
