import { sql } from '@vercel/postgres';

import {
  getDiscordUserIdForUser,
  getRegisteredMemberForGuild,
} from '@/lib/api/auth';
import { loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import { buildUpgradeAdvisory } from '@/lib/services/upgrade-advisory';

export type PlatoonAssignment = {
  phase: number;
  zoneName: string;
  platoonNumber: number;
  slotNumber: number;
  unitName: string | null;
  unitBaseId: string;
  currentRelicTier: number | null;
};

export type UpgradeRecommendation = {
  unitBaseId: string;
  unitName: string;
  currentRelic: number;
  recommendedRelic: number;
  slotsUnlocked: number;
  priority: 'top' | 'good' | 'longterm';
  affectedPhases: { phase: number; category: string; slotsAdded: number }[];
  estimatedCost?: number;
  impactScore?: number;
};

export type MyAssignmentsData = {
  playerName: string | null;
  guildName: string;
  guildSlug: string;
  hasRosterData: boolean;
  platoonAssignments: PlatoonAssignment[];
  upgradeAdvisory: UpgradeRecommendation[];
};

export type MyAssignmentsLoadResult =
  | { ok: true; data: MyAssignmentsData }
  | { ok: false; status: 403 | 404 | 422; error: string };

function calculateRelicCost(fromRelic: number, toRelic: number): number {
  const costs: Record<number, number> = { 1: 50, 2: 75, 3: 100, 4: 150, 5: 200, 6: 300, 7: 400, 8: 500 };
  let total = 0;
  for (let i = fromRelic + 1; i <= toRelic; i++) total += costs[i] ?? 500;
  return total;
}

function calculateUpgradeImpact(
  memberRelic: number,
  memberRarity: number,
  openSlots: Array<{ phase: number; category: string; requiredRelic: number; requiredRarity: number }>,
): { maxRelic: number; slotsByPhase: Map<string, number> } {
  const slotsByPhase = new Map<string, number>();
  let maxRelic = memberRelic;
  for (const slot of openSlots) {
    if (memberRarity < slot.requiredRarity) continue;
    if (memberRelic >= slot.requiredRelic) {
      const key = `${slot.phase}:${slot.category}`;
      slotsByPhase.set(key, (slotsByPhase.get(key) ?? 0) + 1);
    }
    if (memberRelic < slot.requiredRelic && slot.requiredRelic <= 8) {
      maxRelic = Math.max(maxRelic, slot.requiredRelic);
      const key = `${slot.phase}:${slot.category}`;
      slotsByPhase.set(key, (slotsByPhase.get(key) ?? 0) + 1);
    }
  }
  return { maxRelic, slotsByPhase };
}

function calculateUpgradeScore(
  slotsUnlocked: number,
  fromRelic: number,
  toRelic: number,
  affectedPhases: Array<{ currentCoverage: number; newCoverage: number; slotsAdded: number }>,
): number {
  const cost = calculateRelicCost(fromRelic, toRelic);
  if (cost <= 0) return 0;
  const baseValue = slotsUnlocked * 10;
  let completionBonus = 0;
  for (const phase of affectedPhases) {
    if (phase.newCoverage === 100 && phase.currentCoverage < 100) {
      completionBonus += 80 + phase.slotsAdded * 8;
      if (phase.currentCoverage >= 95) completionBonus += 30;
    }
  }
  let coverageGain = 0;
  for (const phase of affectedPhases) {
    const improvement = phase.newCoverage - phase.currentCoverage;
    const weight = phase.currentCoverage < 50 ? 3 : phase.currentCoverage < 80 ? 2 : 1;
    coverageGain += improvement * weight;
  }
  const normalizedCost = Math.log2(cost + 1);
  return Math.round(((baseValue + completionBonus + coverageGain) / normalizedCost) * 100) / 100;
}

function determinePriority(score: number): 'top' | 'good' | 'longterm' {
  if (score >= 25) return 'top';
  if (score >= 12) return 'good';
  return 'longterm';
}

export async function loadMyAssignmentsForGuild(
  userId: string,
  guildId: string,
): Promise<MyAssignmentsLoadResult> {
  const discordUserId = await getDiscordUserIdForUser(userId);
  if (!discordUserId) {
    return {
      ok: false,
      status: 422,
      error: 'Discord identity not linked. Please log out and log back in.',
    };
  }

  const registration = await getRegisteredMemberForGuild(discordUserId, guildId);
  if (!registration) {
    return {
      ok: false,
      status: 403,
      error: 'Not registered as a member of this guild',
    };
  }

  const guildResult = await sql<{ name: string; slug: string }>`
    SELECT name, slug FROM guilds WHERE id = ${guildId} LIMIT 1
  `;
  if (guildResult.rows.length === 0) {
    return {
      ok: false,
      status: 404,
      error: 'Guild not found',
    };
  }
  const { name: guildName, slug: guildSlug } = guildResult.rows[0];

  const memberResult = await sql<{ player_name: string }>`
    SELECT player_name FROM guild_members WHERE id = ${registration.guildMemberId} LIMIT 1
  `;
  const playerName = memberResult.rows[0]?.player_name ?? null;

  const dataset = await loadStrategicPlannerDatasetForGuildSlug(guildSlug);
  const matching = dataset.guild && dataset.reference ? computePlatoonMatching(dataset) : null;

  const rosterByUnit = new Map(
    dataset.roster
      .filter((r) => r.memberId === registration.guildMemberId)
      .map((r) => [r.unitBaseId, r]),
  );

  const platoonAssignments = (matching?.assignments ?? [])
    .filter((a) => a.memberId === registration.guildMemberId)
    .map((a) => ({
      phase: a.phase,
      zoneName: a.zoneName,
      platoonNumber: a.platoonNumber,
      slotNumber: a.slotNumber,
      unitName: a.unitName,
      unitBaseId: a.unitBaseId,
      currentRelicTier: rosterByUnit.get(a.unitBaseId)?.relicTier ?? null,
    }));

  let upgradeAdvisory: UpgradeRecommendation[] = [];

  if (matching) {
    const advisory = buildUpgradeAdvisory({
      dataset,
      matching,
      memberId: registration.guildMemberId,
      maxPerMember: null,
    });

    upgradeAdvisory = advisory.memberRecommendations[0]?.recommendations.map((rec) => ({
      unitBaseId: rec.unitBaseId,
      unitName: rec.unitName,
      currentRelic: rec.currentRelic,
      recommendedRelic: rec.recommendedRelic,
      slotsUnlocked: rec.slotsUnlocked,
      priority: rec.priority,
      affectedPhases: rec.affectedPhases.map(({ phase, category, slotsAdded }) => ({ phase, category, slotsAdded })),
      estimatedCost: rec.estimatedCost,
      impactScore: rec.impactScore,
    })) ?? [];
  }

  return {
    ok: true,
    data: {
      playerName,
      guildName,
      guildSlug,
      hasRosterData: dataset.roster.length > 0,
      platoonAssignments,
      upgradeAdvisory,
    },
  };
}
