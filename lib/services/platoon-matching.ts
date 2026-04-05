/**
 * Platoon Matching Engine — capacitated bipartite maximum matching via Max-Flow.
 *
 * Design goals:
 *   1. Fill as many slots as possible.
 *   2. Prefer solutions that do not over-fragment the same account within a phase.
 *   3. Prefer solutions that keep obviously overqualified owners free when possible,
 *      but without hard-coding specific units or teams.
 */

import type {
  GapActionType,
  IgnoredMatchingScope,
  GapPossibleSource,
  PlanetCategory,
  PlatoonMatchingAssignment,
  PlatoonMatchingCoverage,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
  StrategicPlannerMatchingInput,
  StrategicPlannerRosterInput,
  StrategicPlannerSlotInput,
} from '@/lib/types/platoon-readiness';
import { filterSlotsByIgnoredMatchingScopes } from '@/lib/utils/matching-scopes';

export type {
  GapActionType,
  GapPossibleSource,
  PlatoonMatchingAssignment,
  PlatoonMatchingCoverage,
  PlatoonMatchingGap,
  PlatoonMatchingResult,
};

export type ComputePlatoonMatchingOptions = {
  ignoredScopes?: IgnoredMatchingScope[];
};

/** Maximum platoon slots a single member may fill per category per phase. */
const MEMBER_CAP_PER_CATEGORY = 10;
/** Soft phase-wide brake so one account is not over-used across LS/DS/MIX in the same phase. */
const MEMBER_CAP_PER_PHASE = 18;

/**
 * Increasing cost for the nth assignment of the same member inside one (phase, category).
 * This is not "fairness" for fairness' sake; it is an anti-fragmentation brake.
 */
const CATEGORY_LOAD_COSTS = [0, 8, 22, 45, 80, 125, 180, 245, 320, 405] as const;

/**
 * Additional increasing cost for the nth assignment of the same member anywhere in the phase.
 * This is the main protection against stripping the same account across multiple categories.
 */
const PHASE_LOAD_COSTS = [
  0, 0, 4, 10, 18, 28, 42, 60, 82,
  108, 138, 172, 210, 252, 298, 348, 402, 460,
] as const;

function categoryLoadCostForSlotIndex(slotIndex: number): number {
  return CATEGORY_LOAD_COSTS[slotIndex] ?? CATEGORY_LOAD_COSTS[CATEGORY_LOAD_COSTS.length - 1];
}

function phaseLoadCostForSlotIndex(slotIndex: number): number {
  return PHASE_LOAD_COSTS[slotIndex] ?? PHASE_LOAD_COSTS[PHASE_LOAD_COSTS.length - 1];
}

/** Processing order: main zone categories first, bonus (SPECIAL) last. */
const CATEGORY_PROCESSING_ORDER: PlanetCategory[] = ['LS', 'DS', 'MIX', 'SPECIAL'];

/** Large cost sentinel — must exceed any real edge cost. */
const INF_COST = 1_000_000_000;

/** `${memberId}:${unitBaseId}` — uniquely identifies one character instance. */
type OwnerKey = string;

const OWNER_KEY_SEP = '\u001F';
const OWNER_CATEGORY_SEP = '\u001E';
const MEMBER_PHASE_SEP = '\u001D';

function makeOwnerKey(memberId: string, unitBaseId: string): OwnerKey {
  return `${memberId}${OWNER_KEY_SEP}${unitBaseId}`;
}

function memberIdFromOwnerKey(key: OwnerKey): string {
  const idx = key.indexOf(OWNER_KEY_SEP);
  return idx === -1 ? key : key.slice(0, idx);
}

function makeMemberCategoryKey(memberId: string, category: PlanetCategory): string {
  return `${memberId}:${category}`;
}

function makeMemberPhaseKey(memberId: string, phase: number): string {
  return `${memberId}${MEMBER_PHASE_SEP}${phase}`;
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
 * Generic preservation heuristic without hard-coded unit strings.
 *
 * Interpretation:
 *   - Slightly prefer closer fits.
 *   - Add a modest preservation premium to highly developed owners so they are not
 *     consumed for easy slots unless the solver really wants them.
 *   - Keep this term much smaller than max-flow itself; coverage remains primary.
 */
function edgeCost(
  owner: StrategicPlannerRosterInput,
  slot: StrategicPlannerSlotInput,
  tiebreaker: number,
): number {
  const relicSurplus =
    slot.unitCategory === 'SHIP' ? 0 : Math.max(owner.relicTier - slot.requiredRelicTier, 0);
  const raritySurplus = Math.max(owner.rarity - slot.requiredRarity, 0);

  const fitPenalty = relicSurplus * 18 + raritySurplus * 5;

  // Generic preservation of high-end owners without knowing their team context.
  const ownerPreservation =
    (owner.relicTier >= 9 ? 30 : 0) +
    (owner.relicTier === 8 ? 18 : 0) +
    (owner.relicTier === 7 ? 8 : 0);

  return fitPenalty + ownerPreservation + tiebreaker;
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

function solveMinCostMaxFlow(net: MCMFNetwork): [number, number] {
  const { n, adj, s, t } = net;
  let totalFlow = 0;
  let totalCost = 0;

  const dist = new Int32Array(n);
  const inQueue = new Uint8Array(n);
  const prevNode = new Int32Array(n);
  const prevEdge = new Int32Array(n);

  while (true) {
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

      for (let i = 0; i < adj[u].length; i++) {
        const e = adj[u][i];
        if (e.cap - e.flow <= 0) continue;

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

    if (dist[t] >= INF_COST) break;

    let pushFlow = Infinity;
    for (let v = t; v !== s; ) {
      const u = prevNode[v];
      const e = adj[u][prevEdge[v]];
      pushFlow = Math.min(pushFlow, e.cap - e.flow);
      v = u;
    }

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

// ─── Flow network construction per phase ─────────────────────────────────────

interface GroupMatchResult {
  /** slotKey → OwnerKey that fills it. */
  assignments: Map<string, OwnerKey>;
  /** Set of OwnerKeys that are used in assignments. */
  usedOwners: Set<OwnerKey>;
  /** `${memberId}:${category}` → number of slots assigned. */
  memberCategoryLoad: Map<string, number>;
  /** `${memberId}<sep>${phase}` → number of slots assigned in the whole phase. */
  memberPhaseLoad: Map<string, number>;
}

function normalizeAlgoCategory(
  category: PlanetCategory | null | undefined,
): PlanetCategory {
  return category ?? 'SPECIAL';
}

function runMatchingForPhase(
  phaseSlots: StrategicPlannerSlotInput[],
  rosterByUnit: ReadonlyMap<string, StrategicPlannerRosterInput[]>,
): GroupMatchResult {
  if (phaseSlots.length === 0) {
    return {
      assignments: new Map(),
      usedOwners: new Set(),
      memberCategoryLoad: new Map(),
      memberPhaseLoad: new Map(),
    };
  }

  const phaseNumber = phaseSlots[0]?.phase ?? 0;

  const sortedSlots = [...phaseSlots].sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;

    const categoryOrderA = CATEGORY_PROCESSING_ORDER.indexOf(normalizeAlgoCategory(a.planetCategory));
    const categoryOrderB = CATEGORY_PROCESSING_ORDER.indexOf(normalizeAlgoCategory(b.planetCategory));
    if (categoryOrderA !== categoryOrderB) return categoryOrderA - categoryOrderB;

    if (a.zoneSortOrder !== b.zoneSortOrder) return a.zoneSortOrder - b.zoneSortOrder;
    if (a.platoonSortOrder !== b.platoonSortOrder) return a.platoonSortOrder - b.platoonSortOrder;
    return a.slotNumber - b.slotNumber;
  });

  const slotKeyToIdx = new Map<string, number>();
  for (let i = 0; i < sortedSlots.length; i++) {
    slotKeyToIdx.set(sortedSlots[i].slotKey, i);
  }

  interface CandidateEdge {
    ownerKey: OwnerKey;
    category: PlanetCategory;
    slotIdx: number;
    cost: number;
  }

  const candidateEdges: CandidateEdge[] = [];
  const memberCategorySet = new Set<string>();
  const memberPhaseSet = new Set<string>();
  const ownerKeySet = new Set<OwnerKey>();

  let tiebreakerCounter = 0;

  for (const slot of sortedSlots) {
    const sIdx = slotKeyToIdx.get(slot.slotKey)!;
    const candidates = rosterByUnit.get(slot.unitBaseId) ?? [];

    const sortedCandidates = [...candidates]
      .filter((o) => ownerQualifies(o, slot))
      .sort((a, b) => {
        if (a.relicTier !== b.relicTier) return a.relicTier - b.relicTier;
        if (a.rarity !== b.rarity) return a.rarity - b.rarity;
        return a.playerName.localeCompare(b.playerName);
      });

    for (const owner of sortedCandidates) {
      const ownerKey = makeOwnerKey(owner.memberId, owner.unitBaseId);
      const category = normalizeAlgoCategory(slot.planetCategory);
      const memberCategoryKey = makeMemberCategoryKey(owner.memberId, category);
      const memberPhaseKey = makeMemberPhaseKey(owner.memberId, slot.phase);

      ownerKeySet.add(ownerKey);
      memberCategorySet.add(memberCategoryKey);
      memberPhaseSet.add(memberPhaseKey);

      candidateEdges.push({
        ownerKey,
        category,
        slotIdx: sIdx,
        cost: edgeCost(owner, slot, tiebreakerCounter++),
      });
    }
  }

  const memberCategoryKeys = [...memberCategorySet].sort();
  const memberPhaseKeys = [...memberPhaseSet].sort();
  const ownerKeys = [...ownerKeySet].sort();

  const SOURCE = 0;
  const SINK = 1;
  let nextId = 2;

  const memberPhaseSlotNodes = new Map<string, number[]>();
  for (const memberPhaseKey of memberPhaseKeys) {
    const nodeIds: number[] = [];
    for (let i = 0; i < MEMBER_CAP_PER_PHASE; i++) {
      nodeIds.push(nextId++);
    }
    memberPhaseSlotNodes.set(memberPhaseKey, nodeIds);
  }

  const memberCategorySlotNodes = new Map<string, number[]>();
  for (const memberCategoryKey of memberCategoryKeys) {
    const nodeIds: number[] = [];
    for (let i = 0; i < MEMBER_CAP_PER_CATEGORY; i++) {
      nodeIds.push(nextId++);
    }
    memberCategorySlotNodes.set(memberCategoryKey, nodeIds);
  }

  const ownerKeyToInNodeId = new Map<OwnerKey, number>();
  const ownerKeyToOutNodeId = new Map<OwnerKey, number>();
  for (const ownerKey of ownerKeys) {
    ownerKeyToInNodeId.set(ownerKey, nextId++);
    ownerKeyToOutNodeId.set(ownerKey, nextId++);
  }

  const slotNodeBase = nextId;
  nextId += sortedSlots.length;

  const net = createNetwork(nextId, SOURCE, SINK);

  // SOURCE -> member-phase load nodes.
  for (const memberPhaseKey of memberPhaseKeys) {
    const slotNodes = memberPhaseSlotNodes.get(memberPhaseKey)!;
    for (let i = 0; i < slotNodes.length; i++) {
      addEdge(net, SOURCE, slotNodes[i], 1, phaseLoadCostForSlotIndex(i));
    }
  }

  // member-phase nodes -> member-category nodes (only for same member in this phase)
  for (const memberCategoryKey of memberCategoryKeys) {
    const memberId = memberCategoryKey.split(':')[0];
    const memberPhaseKey = makeMemberPhaseKey(memberId, phaseNumber);

    const phaseNodes = memberPhaseSlotNodes.get(memberPhaseKey);
    const categoryNodes = memberCategorySlotNodes.get(memberCategoryKey);
    if (!phaseNodes || !categoryNodes) continue;

    for (const phaseNodeId of phaseNodes) {
      for (let i = 0; i < categoryNodes.length; i++) {
        addEdge(net, phaseNodeId, categoryNodes[i], 1, categoryLoadCostForSlotIndex(i));
      }
    }
  }

  // memberCategory slot nodes -> ownerIn
  const ownerCategoryKeys = new Set<string>();
  for (const ce of candidateEdges) {
    ownerCategoryKeys.add(`${ce.ownerKey}${OWNER_CATEGORY_SEP}${ce.category}`);
  }

  for (const ownerCategoryKey of [...ownerCategoryKeys].sort()) {
    const idx = ownerCategoryKey.lastIndexOf(OWNER_CATEGORY_SEP);
    if (idx === -1) continue;

    const ownerKey = ownerCategoryKey.slice(0, idx) as OwnerKey;
    const category = ownerCategoryKey.slice(idx + OWNER_CATEGORY_SEP.length) as PlanetCategory;
    const memberId = memberIdFromOwnerKey(ownerKey);
    const memberCategoryKey = makeMemberCategoryKey(memberId, category);
    const categorySlotNodes = memberCategorySlotNodes.get(memberCategoryKey);
    const ownerInNodeId = ownerKeyToInNodeId.get(ownerKey);

    if (!categorySlotNodes || ownerInNodeId == null) continue;

    for (const memberCategorySlotNodeId of categorySlotNodes) {
      addEdge(net, memberCategorySlotNodeId, ownerInNodeId, 1, 0);
    }
  }

  for (const ownerKey of ownerKeys) {
    addEdge(net, ownerKeyToInNodeId.get(ownerKey)!, ownerKeyToOutNodeId.get(ownerKey)!, 1, 0);
  }

  for (const ce of candidateEdges) {
    addEdge(
      net,
      ownerKeyToOutNodeId.get(ce.ownerKey)!,
      slotNodeBase + ce.slotIdx,
      1,
      ce.cost,
    );
  }

  for (let i = 0; i < sortedSlots.length; i++) {
    addEdge(net, slotNodeBase + i, SINK, 1, 0);
  }

  solveMinCostMaxFlow(net);

  const assignments = new Map<string, OwnerKey>();
  const usedOwners = new Set<OwnerKey>();
  const memberCategoryLoad = new Map<string, number>();
  const memberPhaseLoad = new Map<string, number>();

  for (const ownerKey of ownerKeys) {
    const ownerOutNodeId = ownerKeyToOutNodeId.get(ownerKey)!;

    for (const e of net.adj[ownerOutNodeId]) {
      if (e.flow <= 0 || e.to < slotNodeBase || e.to >= slotNodeBase + sortedSlots.length) {
        continue;
      }

      const slotIdx = e.to - slotNodeBase;
      const slot = sortedSlots[slotIdx];
      const memberId = memberIdFromOwnerKey(ownerKey);
      const memberCategoryKey = makeMemberCategoryKey(memberId, normalizeAlgoCategory(slot.planetCategory));
      const memberPhaseKey = makeMemberPhaseKey(memberId, slot.phase);

      assignments.set(slot.slotKey, ownerKey);
      usedOwners.add(ownerKey);
      memberCategoryLoad.set(memberCategoryKey, (memberCategoryLoad.get(memberCategoryKey) ?? 0) + 1);
      memberPhaseLoad.set(memberPhaseKey, (memberPhaseLoad.get(memberPhaseKey) ?? 0) + 1);
    }
  }

  return { assignments, usedOwners, memberCategoryLoad, memberPhaseLoad };
}

// ─── Gap analysis ─────────────────────────────────────────────────────────────

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
        const memberCategoryKey = makeMemberCategoryKey(owner.memberId, normalizeAlgoCategory(slot.planetCategory));
        const memberPhaseKey = makeMemberPhaseKey(owner.memberId, slot.phase);
        const isAtCategoryCap =
          (matchResult.memberCategoryLoad.get(memberCategoryKey) ?? 0) >= MEMBER_CAP_PER_CATEGORY;
        const isAtPhaseCap =
          (matchResult.memberPhaseLoad.get(memberPhaseKey) ?? 0) >= MEMBER_CAP_PER_PHASE;

        if (!isUsed && !isAtCategoryCap && !isAtPhaseCap) {
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

export function computePlatoonMatching(
  dataset: StrategicPlannerMatchingInput,
  options?: ComputePlatoonMatchingOptions,
): PlatoonMatchingResult {
  const slots = filterSlotsByIgnoredMatchingScopes(dataset.slots, options?.ignoredScopes ?? []);
  const { roster, members } = dataset;

  const memberNameMap = new Map<string, string>(members.map((m) => [m.memberId, m.playerName]));

  const uniqueRoster = new Map<string, StrategicPlannerRosterInput>();
  for (const entry of roster) {
    const key = `${entry.memberId}:${entry.unitBaseId}`;
    const existing = uniqueRoster.get(key);

    if (!existing) {
      uniqueRoster.set(key, entry);
      continue;
    }

    if (
      entry.relicTier > existing.relicTier ||
      (entry.relicTier === existing.relicTier && entry.rarity > existing.rarity)
    ) {
      uniqueRoster.set(key, entry);
    }
  }

  const rosterByUnit = new Map<string, StrategicPlannerRosterInput[]>();
  for (const entry of uniqueRoster.values()) {
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
    if (phaseSlots.length === 0) continue;

    const matchResult = runMatchingForPhase(phaseSlots, rosterByUnit);
    const slotIndex = new Map(phaseSlots.map((s) => [s.slotKey, s]));

    for (const category of CATEGORY_PROCESSING_ORDER) {
      const categorySlots = phaseSlots.filter((s) => s.planetCategory === category);
      if (categorySlots.length === 0) continue;

      const assignedCount = categorySlots.filter((s) => matchResult.assignments.has(s.slotKey)).length;
      const requirementCount = categorySlots.length;
      const platoonCoverage = new Map<string, { totalSlots: number; assignedSlots: number }>();

      for (const slot of categorySlots) {
        const existing = platoonCoverage.get(slot.platoonKey) ?? { totalSlots: 0, assignedSlots: 0 };
        existing.totalSlots += 1;
        if (matchResult.assignments.has(slot.slotKey)) {
          existing.assignedSlots += 1;
        }
        platoonCoverage.set(slot.platoonKey, existing);
      }

      const totalPlatoons = platoonCoverage.size;
      const fullPlatoons = [...platoonCoverage.values()].filter(
        (platoon) => platoon.totalSlots > 0 && platoon.assignedSlots === platoon.totalSlots,
      ).length;

      allCoverage.push({
        phase,
        category,
        isBonus: category === 'SPECIAL',
        fullPlatoons,
        totalPlatoons,
        assignedCount,
        requirementCount,
        coveragePercent:
          requirementCount > 0 ? Math.round((assignedCount / requirementCount) * 100) : 100,
      });

      const unmatched = categorySlots.filter((s) => !matchResult.assignments.has(s.slotKey));
      allGaps.push(...buildGaps(unmatched, rosterByUnit, memberNameMap, matchResult));
    }

    for (const [reqId, ownerKey] of matchResult.assignments) {
      const slot = slotIndex.get(reqId);
      if (!slot) continue;

      const memberId = memberIdFromOwnerKey(ownerKey);
      allAssignments.push({
        requirementId: reqId,
        phase: slot.phase,
        zoneKey: slot.zoneKey,
        zoneName: slot.zoneName,
        platoonKey: slot.platoonKey,
        platoonNumber: slot.platoonNumber,
        slotNumber: slot.slotNumber,
        unitBaseId: slot.unitBaseId,
        unitName: slot.unitName,
        planetCategory: slot.planetCategory,
        memberId,
        playerName: memberNameMap.get(memberId) ?? memberId,
      });
    }
  }

  const totalRequired = allCoverage.reduce((sum, e) => sum + e.requirementCount, 0);
  const totalAssigned = allCoverage.reduce((sum, e) => sum + e.assignedCount, 0);
  const seenPerPhaseOwner = new Set<string>();

  for (const assignment of allAssignments) {
    const key = `${assignment.phase}:${assignment.memberId}:${assignment.unitBaseId}`;
    if (seenPerPhaseOwner.has(key)) {
      throw new Error(`Duplicate owner usage across phase detected: ${key}`);
    }
    seenPerPhaseOwner.add(key);
  }

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
