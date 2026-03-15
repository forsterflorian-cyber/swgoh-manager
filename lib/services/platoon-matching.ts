/**
 * Platoon Matching Engine — capacitated bipartite maximum matching via Max-Flow.
 *
 * For each (phase, planetCategory) group the engine:
 *   1. Builds a flow network:
 *        SOURCE → member-nodes (capacity = MEMBER_CAP_PER_CATEGORY)
 *        member-nodes → unit-nodes (capacity = 1 per unique (member, unit) pair)
 *        unit-nodes → slot-nodes (capacity = 1 per eligible edge)
 *        slot-nodes → SINK (capacity = 1)
 *      The max-flow through this network equals the maximum number of fillable slots
 *      under all constraints simultaneously.
 *   2. To achieve the secondary objective (prefer weaker units for easier slots so
 *      stronger copies remain available for harder ones), edges carry a cost derived
 *      from the owner's surplus stats. We solve a Min-Cost Max-Flow (MCMF) via
 *      Successive Shortest Paths with Bellman-Ford (SPFA variant). This guarantees:
 *        - Primary: maximum slots filled (max-flow).
 *        - Secondary: among all max-flow solutions, the one with minimal total cost,
 *          which corresponds to using the weakest sufficient owners first.
 *   3. Classifies every unmatched slot as a gap and recommends the cheapest net closure.
 *
 * Main categories (LS, DS, MIX) are matched first; bonus zones (SPECIAL) follow
 * in the same pass using their own independent capacity budget.
 *
 * Important semantics:
 *   - "reassign" is intentionally NOT emitted as a recommended action. After MCMF the
 *     assignment is already globally optimal for the group; any remaining gap is a true
 *     deficit that cannot be closed by rearranging existing assignments.
 *   - Committed owners appear in possibleSources for operator context only.
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

/** Processing order: main zone categories first, bonus (SPECIAL) last. */
const CATEGORY_PROCESSING_ORDER: PlanetCategory[] = ['LS', 'DS', 'MIX', 'SPECIAL'];

/** Large cost sentinel — must exceed any real edge cost. */
const INF_COST = 1_000_000_000;

/** `${memberId}:${unitBaseId}` — uniquely identifies one character instance. */
type OwnerKey = string;

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
 * Compute a deterministic integer cost for assigning `owner` to `slot`.
 * Lower cost = weaker surplus → preferred so stronger copies stay free.
 *
 * Cost = (relicSurplus * 100 + raritySurplus * 10 + tiebreaker)
 * Tiebreaker ensures determinism across members.
 */
function edgeCost(
  owner: StrategicPlannerRosterInput,
  slot: StrategicPlannerSlotInput,
  tiebreaker: number,
): number {
  const relicSurplus =
    slot.unitCategory === 'SHIP' ? 0 : owner.relicTier - slot.requiredRelicTier;
  const raritySurplus = owner.rarity - slot.requiredRarity;
  return relicSurplus * 100 + raritySurplus * 10 + tiebreaker;
}

// ─── Min-Cost Max-Flow (MCMF) via Successive Shortest Paths + SPFA ───────────

interface MCMFEdge {
  to: number;
  cap: number;
  cost: number;
  flow: number;
  /** Index of the reverse edge in adj[to]. */
  rev: number;
}

interface MCMFNetwork {
  /** Number of nodes. */
  n: number;
  /** Adjacency lists. */
  adj: MCMFEdge[][];
  /** Source node id. */
  s: number;
  /** Sink node id. */
  t: number;
}

function createNetwork(n: number, s: number, t: number): MCMFNetwork {
  const adj: MCMFEdge[][] = Array.from({ length: n }, () => []);
  return { n, adj, s, t };
}

function addEdge(net: MCMFNetwork, from: number, to: number, cap: number, cost: number): void {
  const fwdIdx = net.adj[from].length;
  const revIdx = net.adj[to].length;
  net.adj[from].push({ to, cap, cost, flow: 0, rev: revIdx });
  net.adj[to].push({ to: from, cap: 0, cost: -cost, flow: 0, rev: fwdIdx });
}

/**
 * Successive Shortest Paths using SPFA (Bellman-Ford with queue).
 * Finds max-flow of minimum cost. Returns [totalFlow, totalCost].
 *
 * Because all original edge costs are non-negative and reverse edges
 * have negative cost, SPFA handles this correctly.
 */
function solveMinCostMaxFlow(net: MCMFNetwork): [number, number] {
  const { n, adj, s, t } = net;
  let totalFlow = 0;
  let totalCost = 0;

  // Pre-allocate arrays for SPFA.
  const dist = new Int32Array(n);
  const inQueue = new Uint8Array(n);
  const prevNode = new Int32Array(n);
  const prevEdge = new Int32Array(n);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // SPFA to find shortest path from s to t.
    dist.fill(INF_COST);
    inQueue.fill(0);
    prevNode.fill(-1);
    prevEdge.fill(-1);

    dist[s] = 0;
    inQueue[s] = 1;
    const queue: number[] = [s];
    let head = 0;

    while (head < queue.length) {
      const u = queue[head++];
      inQueue[u] = 0;

      const edges = adj[u];
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.cap - e.flow > 0) {
          const nd = dist[u] + e.cost;
          if (nd < dist[e.to]) {
            dist[e.to] = nd;
            prevNode[e.to] = u;
            prevEdge[e.to] = i;
            if (!inQueue[e.to]) {
              inQueue[e.to] = 1;
              queue.push(e.to);
            }
          }
        }
      }
    }

    if (dist[t] >= INF_COST) break; // No more augmenting paths.

    // Find bottleneck capacity along the path.
    let pushFlow = Infinity;
    for (let v = t; v !== s; ) {
      const u = prevNode[v];
      const e = adj[u][prevEdge[v]];
      pushFlow = Math.min(pushFlow, e.cap - e.flow);
      v = u;
    }

    // Augment along the path.
    for (let v = t; v !== s; ) {
      const u = prevNode[v];
      const ei = prevEdge[v];
      const e = adj[u][ei];
      e.flow += pushFlow;
      adj[v][e.rev].flow -= pushFlow;
      v = u;
    }

    totalFlow += pushFlow;
    totalCost += pushFlow * dist[t];
  }

  return [totalFlow, totalCost];
}

// ─── Flow network construction per (phase, category) group ────────────────────

interface GroupMatchResult {
  /** slotKey → OwnerKey that fills it. */
  assignments: Map<string, OwnerKey>;
  /** Set of OwnerKeys that are used in assignments. */
  usedOwners: Set<OwnerKey>;
  /** memberId → number of slots assigned. */
  memberLoad: Map<string, number>;
}

/**
 * Build and solve an MCMF network for one (phase, category) group.
 *
 * Network topology (5 layers):
 *   [SOURCE] → [member-cap nodes] → [owner-key nodes] → [slot nodes] → [SINK]
 *
 * Node ID layout:
 *   0                             = SOURCE
 *   1                             = SINK
 *   2 .. 2+M-1                   = member-cap nodes  (M = distinct members)
 *   2+M .. 2+M+O-1               = owner-key nodes   (O = distinct eligible (member,unit) pairs)
 *   2+M+O .. 2+M+O+S-1           = slot nodes        (S = number of slots)
 */
function runMatchingForGroup(
  slots: StrategicPlannerSlotInput[],
  rosterByUnit: ReadonlyMap<string, StrategicPlannerRosterInput[]>,
): GroupMatchResult {
  if (slots.length === 0) {
    return { assignments: new Map(), usedOwners: new Set(), memberLoad: new Map() };
  }

  // ── Step 1: Identify all eligible edges and collect unique members & ownerKeys ──

  /** Sorted deterministic slot list. */
  const sortedSlots = [...slots].sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;
    if (a.zoneSortOrder !== b.zoneSortOrder) return a.zoneSortOrder - b.zoneSortOrder;
    if (a.platoonSortOrder !== b.platoonSortOrder) return a.platoonSortOrder - b.platoonSortOrder;
    return a.slotNumber - b.slotNumber;
  });

  const slotKeyToIdx = new Map<string, number>();
  for (let i = 0; i < sortedSlots.length; i++) {
    slotKeyToIdx.set(sortedSlots[i].slotKey, i);
  }

  // Collect eligible edges: (ownerKey, slotIndex, cost)
  interface CandidateEdge {
    ownerKey: OwnerKey;
    memberId: string;
    slotIdx: number;
    cost: number;
  }

  const candidateEdges: CandidateEdge[] = [];
  const memberSet = new Set<string>();
  const ownerKeySet = new Set<OwnerKey>();

  /** Deterministic tiebreaker counter per unit. */
  let tiebreakerCounter = 0;

  for (const slot of sortedSlots) {
    const sIdx = slotKeyToIdx.get(slot.slotKey)!;
    const candidates = rosterByUnit.get(slot.unitBaseId) ?? [];

    // Sort candidates deterministically (weakest first for stable tiebreaker assignment).
    const sorted = [...candidates]
      .filter((o) => ownerQualifies(o, slot))
      .sort((a, b) => {
        if (a.relicTier !== b.relicTier) return a.relicTier - b.relicTier;
        if (a.rarity !== b.rarity) return a.rarity - b.rarity;
        return a.playerName.localeCompare(b.playerName);
      });

    for (const owner of sorted) {
      const oKey = makeOwnerKey(owner.memberId, owner.unitBaseId);
      memberSet.add(owner.memberId);
      ownerKeySet.add(oKey);
      candidateEdges.push({
        ownerKey: oKey,
        memberId: owner.memberId,
        slotIdx: sIdx,
        cost: edgeCost(owner, slot, tiebreakerCounter++),
      });
    }
  }

  // ── Step 2: Assign node IDs ──

  const members = [...memberSet].sort();
  const memberToNodeId = new Map<string, number>();
  const ownerKeys = [...ownerKeySet].sort();
  const ownerKeyToNodeId = new Map<string, number>();

  const SOURCE = 0;
  const SINK = 1;
  let nextId = 2;

  for (const m of members) {
    memberToNodeId.set(m, nextId++);
  }
  for (const ok of ownerKeys) {
    ownerKeyToNodeId.set(ok, nextId++);
  }
  const slotNodeBase = nextId;
  nextId += sortedSlots.length;

  const totalNodes = nextId;

  // ── Step 3: Build network ──

  const net = createNetwork(totalNodes, SOURCE, SINK);

  // SOURCE → member-cap nodes (capacity = MEMBER_CAP_PER_CATEGORY, cost = 0)
  for (const m of members) {
    addEdge(net, SOURCE, memberToNodeId.get(m)!, MEMBER_CAP_PER_CATEGORY, 0);
  }

  // member-cap nodes → owner-key nodes (capacity = 1, cost = 0)
  // Each ownerKey belongs to exactly one member.
  for (const ok of ownerKeys) {
    const memberId = memberIdFromOwnerKey(ok);
    addEdge(net, memberToNodeId.get(memberId)!, ownerKeyToNodeId.get(ok)!, 1, 0);
  }

  // owner-key nodes → slot nodes (capacity = 1, cost = computed edge cost)
  for (const ce of candidateEdges) {
    addEdge(
      net,
      ownerKeyToNodeId.get(ce.ownerKey)!,
      slotNodeBase + ce.slotIdx,
      1,
      ce.cost,
    );
  }

  // slot nodes → SINK (capacity = 1, cost = 0)
  for (let i = 0; i < sortedSlots.length; i++) {
    addEdge(net, slotNodeBase + i, SINK, 1, 0);
  }

  // ── Step 4: Solve ──

  solveMinCostMaxFlow(net);

  // ── Step 5: Extract assignments ──

  const assignments = new Map<string, OwnerKey>();
  const usedOwners = new Set<OwnerKey>();
  const memberLoad = new Map<string, number>();

  // Check flow on owner-key → slot edges.
  for (const ok of ownerKeys) {
    const nodeId = ownerKeyToNodeId.get(ok)!;
    for (const e of net.adj[nodeId]) {
      if (e.flow > 0 && e.to >= slotNodeBase && e.to < slotNodeBase + sortedSlots.length) {
        const slotIdx = e.to - slotNodeBase;
        const slot = sortedSlots[slotIdx];
        assignments.set(slot.slotKey, ok);
        usedOwners.add(ok);
        const mid = memberIdFromOwnerKey(ok);
        memberLoad.set(mid, (memberLoad.get(mid) ?? 0) + 1);
      }
    }
  }

  return { assignments, usedOwners, memberLoad };
}

// ─── Gap analysis ─────────────────────────────────────────────────────────────

/**
 * For every unmatched slot, determine the cheapest net closure path.
 *
 * Because the matching is already globally optimal (MCMF), any remaining gap
 * represents a true deficit. Owners that are qualified but committed elsewhere
 * cannot close this gap without reducing the total match count.
 *
 * Priority:
 *   1. use_unused — eligible owner exists with remaining capacity and no assignment.
 *   2. upgrade    — near-miss owner (≤ 2 relic, ≤ 1 rarity short).
 *   3. acquire    — no owner qualifies or approaches qualification.
 */
function buildGaps(
  unmatched: StrategicPlannerSlotInput[],
  rosterByUnit: ReadonlyMap<string, StrategicPlannerRosterInput[]>,
  memberNameMap: ReadonlyMap<string, string>,
  matchResult: GroupMatchResult,
): PlatoonMatchingGap[] {
  return unmatched.map((slot): PlatoonMatchingGap => {
    const owners = rosterByUnit.get(slot.unitBaseId) ?? [];

    const freeEligible: GapPossibleSource[] = [];
    const busyEligible: GapPossibleSource[] = [];
    const nearMissSources: GapPossibleSource[] = [];
    const ownedButInsufficient: GapPossibleSource[] = [];
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

        const isUsed = matchResult.usedOwners.has(oKey);
        const isAtCap =
          (matchResult.memberLoad.get(owner.memberId) ?? 0) >= MEMBER_CAP_PER_CATEGORY;

        if (!isUsed && !isAtCap) {
          freeEligible.push(source);
        } else {
          busyEligible.push(source);
        }
        continue;
      }
      const { missingRelicTiers, missingRarity } = getDeficits(owner, slot);

      ownedButInsufficient.push({
        memberId: owner.memberId,
        playerName,
        kind: 'near_miss',
        missingRelicTiers,
        missingRarity,
      });
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

    // Deterministic sort for near misses.
    nearMissSources.sort(
      (a, b) =>
        a.missingRelicTiers - b.missingRelicTiers ||
        a.missingRarity - b.missingRarity ||
        a.playerName.localeCompare(b.playerName),
    );

    ownedButInsufficient.sort(
   (a, b) =>
    a.missingRelicTiers - b.missingRelicTiers ||
    a.missingRarity - b.missingRarity ||
    a.playerName.localeCompare(b.playerName),
    );

    // Deterministic sort for free eligible.
    freeEligible.sort((a, b) => a.playerName.localeCompare(b.playerName));
    busyEligible.sort((a, b) => a.playerName.localeCompare(b.playerName));

    let recommendedAction: GapActionType;
    let possibleSources: GapPossibleSource[];

    if (freeEligible.length > 0) {
      recommendedAction = 'use_unused';
      possibleSources = freeEligible;
    } else if (ownedButInsufficient.length > 0) {
      recommendedAction = 'upgrade';
      possibleSources = ownedButInsufficient;
    } else {
      recommendedAction = 'acquire';
      possibleSources = [];
    }
    return {
      requirementId: slot.slotKey,
      phase: slot.phase,
      zoneKey: slot.zoneKey,
      zoneName: slot.zoneName,
      platoonKey: slot.platoonKey,
      platoonNumber: slot.platoonNumber,
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the optimal assignment of guild characters to platoon slots
 * for all phases and all planet categories using Min-Cost Max-Flow.
 */
export function computePlatoonMatching(dataset: StrategicPlannerDataset): PlatoonMatchingResult {
  const { slots, roster, members } = dataset;

  const memberNameMap = new Map<string, string>(
    members.map((m) => [m.memberId, m.playerName]),
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

  const phases = [...new Set(slots.map((s) => s.phase))].sort((a, b) => a - b);

  const allCoverage: PlatoonMatchingCoverage[] = [];
  const allAssignments: PlatoonMatchingAssignment[] = [];
  const allGaps: PlatoonMatchingGap[] = [];

  for (const phase of phases) {
    const phaseSlots = slots.filter((s) => s.phase === phase);

    for (const category of CATEGORY_PROCESSING_ORDER) {
      const group = phaseSlots.filter((s) => s.planetCategory === category);
      if (group.length === 0) continue;

      const matchResult = runMatchingForGroup(group, rosterByUnit);

      const assignedCount = matchResult.assignments.size;
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

      const slotIndex = new Map(group.map((s) => [s.slotKey, s]));

      for (const [reqId, oKey] of matchResult.assignments) {
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
          planetCategory: slot.planetCategory,
          memberId,
          playerName: memberNameMap.get(memberId) ?? memberId,
        });
      }

      const unmatched = group.filter((s) => !matchResult.assignments.has(s.slotKey));
      allGaps.push(...buildGaps(unmatched, rosterByUnit, memberNameMap, matchResult));
    }
  }

  const totalRequired = allCoverage.reduce((sum, e) => sum + e.requirementCount, 0);
  const totalAssigned = allCoverage.reduce((sum, e) => sum + e.assignedCount, 0);

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