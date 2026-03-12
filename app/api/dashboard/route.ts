import { sql } from '@vercel/postgres';

import { getAuthenticatedUser } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { PlatoonReadinessService } from '@/lib/services/platoon-readiness';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const planning = await PlatoonReadinessService.analyzeForUser(user.id);
    const guild = planning.guild;

    if (!guild) {
      return jsonOk({
        guild: null,
        activeTb: null,
        lastRosterSync: null,
        strategicReadiness: null,
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
        swgoh_gg_id: null,
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
      strategicReadiness:
        planning.summary && planning.reference
          ? {
              reference: {
                name: planning.reference.name,
                tbKey: planning.reference.tbKey,
              },
              summary: planning.summary,
              topMissingUnits: planning.topMissingUnits.slice(0, 5).map((unit) => ({
                unitName: unit.unitName,
                missingSlots: unit.missingSlots,
                blockedSlots: unit.blockedSlots,
                blockedZones: unit.blockedZones,
                blockedPlatoons: unit.blockedPlatoons,
                limitingZones: unit.limitingZones,
                limitingPlatoons: unit.limitingPlatoons,
                nearMissOwners: unit.nearMissOwners,
                nearMissSlots: unit.nearMissSlots,
                hardMissingSlots: unit.hardMissingSlots,
                estimatedUnlockSlots: unit.estimatedUnlockSlots,
                primaryConstraint: unit.primaryConstraint,
                reasonSummary: unit.reasonSummary,
                impactScore: unit.impactScore,
              })),
              zones: [...planning.zones]
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
                  status: zone.status,
                  estimatedCoverablePlatoons: zone.estimatedCoverablePlatoons,
                  totalPlatoons: zone.totalPlatoons,
                  blockers: zone.blockers.slice(0, 2).map((blocker) => blocker.unitName),
                })),
              recommendedActions: planning.recommendedActions,
              dataState: planning.dataState,
            }
          : {
              reference: planning.reference
                ? {
                    name: planning.reference.name,
                    tbKey: planning.reference.tbKey,
                  }
                : null,
              summary: null,
              topMissingUnits: [],
              zones: [],
              recommendedActions: planning.recommendedActions,
              dataState: planning.dataState,
            },
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Dashboard lookup failed',
      500
    );
  }
}
