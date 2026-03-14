/**
 * Tests for lib/services/tb-zone-matcher.ts
 *
 * Uses the built-in Node.js test runner (no extra dependencies).
 * Run with:
 *   npm test
 *   node --experimental-strip-types --test lib/services/__tests__/tb-zone-matcher.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  matchZone,
  MAX_ASSIGNMENTS_PER_MEMBER_PER_ZONE,
  type MatcherSlot,
  type MatcherRosterEntry,
  type MatcherLockedAssignment,
} from '../tb-zone-matcher.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slot(id: string, unitBaseId: string, minRelic = 0, minRarity = 7): MatcherSlot {
  return { slotId: id, unitBaseId, minRelic, minRarity };
}

function member(
  memberId: string,
  relicTier: number,
  rarity = 7,
  unitBaseId = 'UNIT_A'
): MatcherRosterEntry {
  return {
    memberId,
    allyCode: `AC_${memberId}`,
    playerName: `Player ${memberId}`,
    relicTier,
    rarity,
  };
}

function rosterMap(
  unitBaseId: string,
  members: MatcherRosterEntry[]
): Map<string, MatcherRosterEntry[]> {
  return new Map([[unitBaseId, members]]);
}

// ---------------------------------------------------------------------------
// 1. Basic assignment — slot gets filled when candidates exist
// ---------------------------------------------------------------------------

describe('basic assignment', () => {
  it('fills a slot with the best qualified member', () => {
    const slots = [slot('s1', 'UNIT_A', 5)];
    const roster = rosterMap('UNIT_A', [member('m1', 7)]);

    const result = matchZone(slots, roster, [], new Set());

    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].memberId, 'm1');
    assert.equal(result.openSlots.length, 0);
    assert.equal(result.filledCount, 1);
  });

  it('leaves slot open when no member qualifies', () => {
    const slots = [slot('s1', 'UNIT_A', 8)];
    const roster = rosterMap('UNIT_A', [member('m1', 5)]); // below minRelic

    const result = matchZone(slots, roster, [], new Set());

    assert.equal(result.proposals.length, 0);
    assert.equal(result.openSlots.length, 1);
    assert.equal(result.openSlots[0].reason, 'no_eligible_member');
  });
});

// ---------------------------------------------------------------------------
// 2. LOCKED assignments are never moved
// ---------------------------------------------------------------------------

describe('LOCKED assignments', () => {
  it('skips a slot that already has a LOCKED assignment', () => {
    const slots = [slot('s1', 'UNIT_A', 5)];
    const roster = rosterMap('UNIT_A', [member('m1', 7), member('m2', 6)]);
    const locked: MatcherLockedAssignment[] = [
      { slotId: 's1', memberId: 'm1', allyCode: 'AC_m1', unitBaseId: 'UNIT_A' },
    ];

    const result = matchZone(slots, roster, locked, new Set());

    // No FLEX proposals — the slot is covered by LOCKED
    assert.equal(result.proposals.length, 0);
    assert.equal(result.openSlots.length, 0);
    // filledCount includes the LOCKED assignment
    assert.equal(result.filledCount, 1);
  });

  it('does not reassign a LOCKED assignment during rebalancing', () => {
    // m1 is LOCKED on s1; s2 needs m1 but m1 is at cap (1 lock out of 1 available).
    // There is no alternative for s2.
    const maxPerMember = 1;
    const slots = [slot('s1', 'UNIT_A'), slot('s2', 'UNIT_A')];
    const roster = rosterMap('UNIT_A', [member('m1', 7)]);
    const locked: MatcherLockedAssignment[] = [
      { slotId: 's1', memberId: 'm1', allyCode: 'AC_m1', unitBaseId: 'UNIT_A' },
    ];

    const result = matchZone(slots, roster, locked, new Set(), maxPerMember);

    // s2 cannot be filled — only m1 qualifies and they are at cap (locked on s1)
    assert.equal(result.proposals.length, 0);
    assert.equal(result.openSlots.length, 1);
    assert.equal(result.openSlots[0].slotId, 's2');
    // The LOCKED entry on s1 is preserved
    assert.equal(result.filledCount, 1); // 1 locked + 0 flex
  });
});

// ---------------------------------------------------------------------------
// 3. Zone capacity cap (max 10 per member)
// ---------------------------------------------------------------------------

describe('zone capacity cap', () => {
  it('stops assigning to a member after they reach maxPerMember', () => {
    const maxPerMember = 3;
    // 4 slots each requiring a DIFFERENT unit; m1 owns all 4 units.
    // (Realistic: in TB, different platoon slots require different units.)
    // With cap=3, m1 can fill at most 3 slots; the 4th must stay open.
    const units = ['UNIT_A', 'UNIT_B', 'UNIT_C', 'UNIT_D'];
    const slots = units.map((u, i) => slot(`s${i + 1}`, u));
    const roster = new Map(units.map((u) => [u, [member('m1', 7)]]));

    const result = matchZone(slots, roster, [], new Set(), maxPerMember);

    assert.equal(result.proposals.length, 3, 'm1 should fill exactly 3 slots');
    assert.equal(result.openSlots.length, 1, 'one slot should remain open');
    assert.equal(result.openSlots[0].reason, 'eligible_at_capacity');
  });

  it('counts LOCKED assignments toward the zone cap', () => {
    const maxPerMember = 2;
    // m1 is LOCKED on s1 (UNIT_A) — uses 1 of 2 cap.
    // s2 needs UNIT_B and s3 needs UNIT_C; only m1 qualifies for both.
    // m1 can fill exactly 1 more slot; the other stays open.
    const slots = [slot('s1', 'UNIT_A'), slot('s2', 'UNIT_B'), slot('s3', 'UNIT_C')];
    const roster = new Map([
      ['UNIT_A', [member('m1', 7)]],
      ['UNIT_B', [member('m1', 7)]],
      ['UNIT_C', [member('m1', 7)]],
    ]);
    const locked: MatcherLockedAssignment[] = [
      { slotId: 's1', memberId: 'm1', allyCode: 'AC_m1', unitBaseId: 'UNIT_A' },
    ];

    const result = matchZone(slots, roster, locked, new Set(), maxPerMember);

    // 1 FLEX proposal for one of s2/s3; the other stays open
    assert.equal(result.proposals.length, 1, 'm1 should fill exactly 1 more slot');
    assert.equal(result.openSlots.length, 1);
    assert.equal(result.openSlots[0].reason, 'eligible_at_capacity');
  });
});

// ---------------------------------------------------------------------------
// 4. Scarcity-first ordering
// ---------------------------------------------------------------------------

describe('scarcity-first ordering', () => {
  it('fills the rarest slot (fewest candidates) first', () => {
    // s1 needs UNIT_A — both m1 and m2 qualify
    // s2 needs UNIT_B — only m2 qualifies (scarcer)
    // maxPerMember = 1 so each member can fill exactly 1 slot
    const maxPerMember = 1;
    const slots = [slot('s1', 'UNIT_A'), slot('s2', 'UNIT_B')];
    const roster = new Map<string, MatcherRosterEntry[]>([
      ['UNIT_A', [member('m1', 7), member('m2', 7)]],
      ['UNIT_B', [member('m2', 7)]],
    ]);

    const result = matchZone(slots, roster, [], new Set(), maxPerMember);

    // s2 (1 candidate) must be filled first; m2 goes to s2, m1 fills s1
    assert.equal(result.proposals.length, 2);
    assert.equal(result.openSlots.length, 0);

    const s1proposal = result.proposals.find((p) => p.slotId === 's1');
    const s2proposal = result.proposals.find((p) => p.slotId === 's2');
    assert.ok(s1proposal, 's1 should be filled');
    assert.ok(s2proposal, 's2 should be filled');
    assert.equal(s2proposal!.memberId, 'm2', 'm2 should fill the scarce s2 slot');
    assert.equal(s1proposal!.memberId, 'm1', 'm1 should fill s1 after m2 is used');
  });
});

// ---------------------------------------------------------------------------
// 5. Single-hop rebalancing
// ---------------------------------------------------------------------------

describe('single-hop rebalancing', () => {
  it('frees a FLEX proposal to resolve an eligible_at_capacity slot', () => {
    // maxPerMember = 1
    // s1 can be filled by m1 or m2
    // s2 can only be filled by m1
    // Without rebalancing: m1→s1 (greedy), s2 open (eligible_at_capacity)
    // With rebalancing: redirect m1's s1 proposal to m2, fill s2 with m1
    const maxPerMember = 1;
    const slots = [slot('s1', 'UNIT_A'), slot('s2', 'UNIT_B')];
    const roster = new Map<string, MatcherRosterEntry[]>([
      ['UNIT_A', [member('m1', 7), member('m2', 7)]],
      // s2 = UNIT_B; only m1 owns it
      ['UNIT_B', [member('m1', 7)]],
    ]);

    const result = matchZone(slots, roster, [], new Set(), maxPerMember);

    assert.equal(result.proposals.length, 2, 'both slots should be filled after rebalancing');
    assert.equal(result.openSlots.length, 0);

    const s2proposal = result.proposals.find((p) => p.slotId === 's2');
    assert.equal(s2proposal?.memberId, 'm1', 'm1 should fill the scarce s2 slot');
  });

  it('does not move LOCKED assignments during rebalancing', () => {
    // m1 is LOCKED on s1 and is at cap (maxPerMember=1)
    // s2 needs m1 only — but m1 is locked and cannot be freed
    const maxPerMember = 1;
    const slots = [slot('s1', 'UNIT_A'), slot('s2', 'UNIT_B')];
    const roster = new Map<string, MatcherRosterEntry[]>([
      ['UNIT_A', [member('m1', 7)]],
      ['UNIT_B', [member('m1', 7)]],
    ]);
    const locked: MatcherLockedAssignment[] = [
      { slotId: 's1', memberId: 'm1', allyCode: 'AC_m1', unitBaseId: 'UNIT_A' },
    ];

    const result = matchZone(slots, roster, locked, new Set(), maxPerMember);

    // s2 cannot be filled — m1 is locked on s1, LOCKED is not a flex proposal to swap
    assert.equal(result.proposals.length, 0);
    assert.equal(result.openSlots.length, 1);
    assert.equal(result.openSlots[0].slotId, 's2');
  });
});

// ---------------------------------------------------------------------------
// 6. Phase-level unit deduplication (same unit in two zones)
// ---------------------------------------------------------------------------

describe('phase-level unit deduplication', () => {
  it('does not assign same unit to member twice in the phase', () => {
    const slots = [slot('s1', 'UNIT_A')];
    const roster = rosterMap('UNIT_A', [member('m1', 7), member('m2', 7)]);
    // m1 is already assigned UNIT_A in another zone this phase
    const phaseKeys = new Set(['AC_m1:UNIT_A']);

    const result = matchZone(slots, roster, [], phaseKeys);

    // m2 should be used; m1 is blocked by phaseKeys
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].memberId, 'm2');
  });

  it('reports no_eligible_member if all members are phase-blocked', () => {
    const slots = [slot('s1', 'UNIT_A')];
    const roster = rosterMap('UNIT_A', [member('m1', 7)]);
    const phaseKeys = new Set(['AC_m1:UNIT_A']);

    const result = matchZone(slots, roster, [], phaseKeys);

    assert.equal(result.proposals.length, 0);
    // Only m1 exists and they are blocked; the slot has a qualified member but they
    // are excluded via phaseKeys, so reason is no_eligible_member (no available member)
    assert.equal(result.openSlots.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 7. Determinism — same inputs always produce the same output
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('produces identical proposals for repeated calls with the same inputs', () => {
    const slots = ['s1', 's2', 's3'].map((id) => slot(id, 'UNIT_A'));
    const roster = rosterMap('UNIT_A', [
      member('m1', 7),
      member('m2', 6),
      member('m3', 5),
    ]);

    const r1 = matchZone(slots, roster, [], new Set());
    const r2 = matchZone(slots, roster, [], new Set());

    assert.deepEqual(
      r1.proposals.map((p) => `${p.slotId}:${p.memberId}`),
      r2.proposals.map((p) => `${p.slotId}:${p.memberId}`)
    );
  });
});

// ---------------------------------------------------------------------------
// 8. openReason: eligible_at_capacity
// ---------------------------------------------------------------------------

describe('openReason eligible_at_capacity', () => {
  it('reports eligible_at_capacity when all qualified members are full', () => {
    const maxPerMember = 1;
    // m1 fills s1; s2 and s3 both need UNIT_A but m1 is at cap
    const slots = ['s1', 's2', 's3'].map((id) => slot(id, 'UNIT_A'));
    const roster = rosterMap('UNIT_A', [member('m1', 7)]);

    const result = matchZone(slots, roster, [], new Set(), maxPerMember);

    const capacityReasons = result.openSlots.filter(
      (o) => o.reason === 'eligible_at_capacity'
    );
    assert.ok(capacityReasons.length >= 1, 'at least one slot should report eligible_at_capacity');
  });
});
