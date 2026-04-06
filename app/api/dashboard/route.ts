import { sql } from '@vercel/postgres';

import { getAuthenticatedUser } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { PlatoonReadinessService, loadStrategicPlannerDatasetForGuildSlug } from '@/lib/services/platoon-readiness';
import { computePlatoonMatching } from '@/lib/services/platoon-matching';
import type { PlatoonMatchingGap, PlanetCategory } from '@/lib/types/platoon-readiness';
import { getPrimaryGuildSettingsForUser } from '@/lib/services/guild-settings';

export const runtime = 'nodejs';


function formatCategoryLabel(category: PlanetCategory): string {
  return category === 'SPECIAL' ? 'Bonus' : category;
}

function summarizeGapReason(gaps: PlatoonMatchingGap[]): string {
  const freeEligible = new Set<string>();
  const nearMiss = new Set<string>();
  const capacityBlocked = new Set<string>();

  for (const gap of gaps) {
    for (const source of gap.possibleSources) {
      if (source.kind === 'eligible') {
        freeEligible.add(source.memberId);
      } else if ((source.missingRelicTiers ?? 0) <= 2 && (source.missingRarity ?? 0) <= 1) {
        nearMiss.add(source.memberId);
      } else {
        capacityBlocked.add(source.memberId);
      }
    }
  }

  const parts: string[] = [];
  if (freeEligible.size > 0) parts.push(`${freeEligible.size} member${freeEligible.size === 1 ? '' : 's'} qualify now`);
  if (nearMiss.size > 0) parts.push(`${nearMiss.size} near miss${nearMiss.size === 1 ? '' : 'es'} need small upgrades`);
  if (capacityBlocked.size > 0) parts.push(`${capacityBlocked.size} owned copies are tied up elsewhere`);

  return parts.length > 0 ? parts.join(' · ') : 'Open slots remain with no immediately eligible copy in the current matching state.';
}

async function buildCoverageSignals(guildSlug: string) {
  const dataset = await loadStrategicPlannerDatasetForGuildSlug(guildSlug);
  if (!dataset.guild || !dataset.reference) {
    return null;
  }

  const matching = computePlatoonMatching(dataset);

  const topMissingUnits = Array.from(
    matching.gaps.reduce((map, gap) => {
      const key = gap.unitBaseId;
      const existing = map.get(key) ?? {
        unitName: gap.unitName ?? gap.unitBaseId,
        missingSlots: 0,
        gaps: [] as PlatoonMatchingGap[],
      };
      existing.missingSlots += 1;
      existing.gaps.push(gap);
      map.set(key, existing);
      return map;
    }, new Map<string, { unitName: string; missingSlots: number; gaps: PlatoonMatchingGap[] }>())
      .values()
  )
    .sort((left, right) => right.missingSlots - left.missingSlots || left.unitName.localeCompare(right.unitName))
    .slice(0, 5)
    .map((entry) => ({
      unitName: entry.unitName,
      missingSlots: entry.missingSlots,
      reasonSummary: summarizeGapReason(entry.gaps),
    }));

  const blockersByScope = matching.gaps.reduce((map, gap) => {
    const key = `${gap.phase}:${gap.planetCategory ?? 'MIX'}`;
    const counts = map.get(key) ?? new Map<string, { unitName: string; count: number }>();
    const blockerKey = gap.unitBaseId;
    const existing = counts.get(blockerKey) ?? { unitName: gap.unitName ?? gap.unitBaseId, count: 0 };
    existing.count += 1;
    counts.set(blockerKey, existing);
    map.set(key, counts);
    return map;
  }, new Map<string, Map<string, { unitName: string; count: number }>>());

  const zones = [...matching.coverage]
    .map((entry) => {
      const key = `${entry.phase}:${entry.category}`;
      const blockers = Array.from((blockersByScope.get(key) ?? new Map()).values())
        .sort((left, right) => right.count - left.count || left.unitName.localeCompare(right.unitName))
        .slice(0, 2)
        .map((blocker) => blocker.unitName);

      return {
        phase: entry.phase,
        zoneName: formatCategoryLabel(entry.category),
        missingSlots: Math.max(entry.requirementCount - entry.assignedCount, 0),
        blockers,
      };
    })
    .sort((left, right) => right.missingSlots - left.missingSlots || left.phase - right.phase)
    .slice(0, 4);

  return { topMissingUnits, zones };
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const [planning, guildSettings] = await Promise.all([
      PlatoonReadinessService.analyzeForUser(user.id),
      getPrimaryGuildSettingsForUser(user.id),
    ]);
    const guild = planning.guild;

    if (!guild) {
      return jsonOk({
        guild: null,
        activeTb: null,
        lastRosterSync: null,
        strategicReadiness: null,
        permissions: {
          canManageGuild: false,
        },
      });
    }

    const activeTbResult = await sql<{
      id: string;
      name: string | null;
      status: string;
      definition_name: string;
    }>`
      SELECT
        ti.id,
        ti.name,
        ti.status,
        td.name AS definition_name
      FROM tb_instances ti
      JOIN tb_definitions td ON td.id = ti.tb_definition_id
      WHERE ti.guild_id = ${guild.id}
        AND ti.status IN ('planning', 'active')
      ORDER BY
        CASE ti.status
          WHEN 'active' THEN 0
          ELSE 1
        END,
        ti.created_at DESC
      LIMIT 1
    `;

    return jsonOk({
      guild: {
        id: guild.id,
        name: guild.name,
        slug: guild.slug,
        swgoh_gg_id: guildSettings?.guildId ?? null,
        memberCount: guild.memberCount,
        rosteredMembers: guild.rosteredMembers,
      },
      activeTb:
        activeTbResult.rows[0]
          ? {
              id: activeTbResult.rows[0].id,
              name: activeTbResult.rows[0].name || activeTbResult.rows[0].definition_name,
              status: activeTbResult.rows[0].status,
            }
          : null,
      lastRosterSync: guild.lastRosterSync,
      strategicReadiness: await (async () => {
        const matchingSignals = guild.slug ? await buildCoverageSignals(guild.slug) : null;

        if (planning.summary && planning.reference) {
          return {
            reference: {
              name: planning.reference.name,
              tbKey: planning.reference.tbKey,
            },
            summary: planning.summary,
            topMissingUnits: matchingSignals?.topMissingUnits ?? planning.topMissingUnits.slice(0, 5).map((unit) => ({
              unitName: unit.unitName,
              missingSlots: unit.missingSlots,
              reasonSummary: unit.reasonSummary,
            })),
            zones: matchingSignals?.zones ?? [...planning.zones]
              .sort((left, right) => {
                if (right.missingSlots !== left.missingSlots) {
                  return right.missingSlots - left.missingSlots;
                }

                return left.phase - right.phase;
              })
              .slice(0, 4)
              .map((zone) => ({
                phase: zone.phase,
                zoneName: zone.zoneName,
                missingSlots: zone.missingSlots,
                blockers: zone.blockers.slice(0, 2).map((blocker) => blocker.unitName),
              })),
            recommendedActions: planning.recommendedActions,
            dataState: planning.dataState,
          };
        }

        return {
          reference: planning.reference
            ? {
                name: planning.reference.name,
                tbKey: planning.reference.tbKey,
              }
            : null,
          summary: null,
          topMissingUnits: matchingSignals?.topMissingUnits ?? [],
          zones: matchingSignals?.zones ?? [],
          recommendedActions: planning.recommendedActions,
          dataState: planning.dataState,
        };
      })(),
      permissions: {
        canManageGuild: planning.permissions.canManageTargets,
      },
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Dashboard lookup failed',
      500
    );
  }
}
