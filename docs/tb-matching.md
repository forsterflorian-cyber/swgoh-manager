# TB Planner — Matching & Assignment Model

## Overview

The Territory Battle Planner assigns guild members to platoon slots within a zone.
Matching runs **per zone**, not per platoon.  Each zone is treated independently;
bonus zones use the same engine with their own capacity budget.

---

## Assignment types

| `lock_type` | Source  | Meaning                                              |
|-------------|---------|------------------------------------------------------|
| `LOCKED`    | MANUAL  | Set by an officer.  Never moved by auto-assign or rebalancing. |
| `FLEX`      | AUTO    | Proposed by the matching engine.  Replaced on every recompute. |

---

## Matching heuristic (v1)

The engine is implemented in [`lib/services/tb-zone-matcher.ts`](../lib/services/tb-zone-matcher.ts).
It is a **greedy, deterministic heuristic** — not a globally optimal solver.

### Step 1 — Candidate lists

For each open slot (slots with a LOCKED assignment are skipped), build a list of
all guild members who qualify:

```
qualifies(member, slot) ⟺  member.relicTier ≥ slot.minRelic
                         AND member.rarity   ≥ slot.minRarity
```

Candidates are sorted by `(score ASC, allyCode ASC)` so output is deterministic:

```
score = (lockedZoneLoad × 10) − relicTier
```

Lower score = preferred (lightly loaded member with high relic tier wins ties).

### Step 2 — Scarcity-first ordering

Open slots are sorted by **ascending candidate count** (fewest qualified members first),
with `slotId` as a deterministic tiebreaker.

Rationale: filling hard-to-fill slots first prevents a greedy early assignment from
consuming the only candidate for a scarce slot.

### Step 3 — Greedy pass

Iterate slots in scarcity order.  For each slot, pick the first candidate who:

1. Has remaining zone capacity (`zoneAssignments < maxPerMember`, default 10).
2. Has not already been assigned the same unit elsewhere in the phase
   (prevents one member donating the same unit to two zones).

### Step 4 — Single-level rebalancing

For each slot left open after the greedy pass because all qualified candidates are
at zone capacity:

1. For each at-capacity candidate (`blocked`):
   - Inspect `blocked`'s current FLEX proposals in this zone.
   - For each such proposal (`toMove`), look for an **alternative** member who
     also qualifies for `toMove`'s slot and still has capacity.
   - If found: redirect `toMove` to the alternative, freeing one capacity unit for
     `blocked`, then assign `blocked` to the originally blocked slot.
   - Stop after the first successful swap (`break outer`).

This is a **single-hop swap only** — no recursive or multi-hop rebalancing.
LOCKED assignments are never touched during this phase.

---

## Manual assignment validation (simulation)

When an officer manually assigns a member to a slot (`lock_type = LOCKED`):

1. Count `filledBefore` = number of slots currently assigned in the zone.
2. Tentatively add the new LOCKED assignment and run `matchZone` in-memory
   (no DB writes yet).
3. `filledAfter` = LOCKED count + proposals count from the simulation.
4. If `filledAfter < filledBefore` → reject with an explanation.
5. Otherwise: write the LOCKED assignment, delete all FLEX for the zone, write
   new FLEX proposals from the simulation.

This ensures a manual assignment can never silently reduce zone coverage.

---

## Zone capacity

- **Max 10 assignments per member per zone** (LOCKED + FLEX combined).
- Main zones and bonus zones each have their own independent capacity budget.
- The cap is enforced by the matching engine and validated in `assignPlayer`.

---

## Determinism

Given the same inputs (slots, roster, locked assignments, phase unit keys),
`matchZone` always returns the same proposals.  Tie-breaking is by `allyCode ASC`
after the score comparison, which is stable across calls.

---

## Slot open reasons

| `openReason`              | Meaning                                                    |
|---------------------------|------------------------------------------------------------|
| `null`                    | Slot is filled, or has open candidates (auto-assign not yet run). |
| `no_eligible_member`      | No guild member meets relic/rarity requirements.           |
| `eligible_at_capacity`    | Qualified members exist but all have reached the zone cap. |

---

## Bonus zones

Bonus zones are treated as separate zones with their own slot list and capacity
budget.  No special engine is needed: `matchZone` is called once per zone.

---

## What this is NOT

- Not a global optimiser or ILP solver.
- Not fairness-aware (load balancing is a future concern, not v1).
- Not multi-phase aware (each zone is planned independently).
