import { sql } from '@vercel/postgres';

import { getAuthenticatedUser } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { toNumber } from '@/lib/utils/to-number';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const result = await sql<{
      id: string;
      name: string;
      swgoh_gg_id: string | null;
      slug: string;
      memberCount: string | number;
    }>`
      SELECT
        g.id,
        g.name,
        g.swgoh_gg_id,
        g.slug,
        (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) AS "memberCount"
      FROM users u
      JOIN permissions p ON p.user_id = u.id
      JOIN guilds g ON g.id = p.guild_id
      WHERE u.id = ${user.id}
      ORDER BY
        CASE p.role
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          WHEN 'officer' THEN 2
          ELSE 3
        END,
        g.created_at ASC
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return jsonOk({ guild: null, activeTb: null, lastRosterSync: null });
    }

    const guild = {
      ...result.rows[0],
      memberCount: toNumber(result.rows[0].memberCount),
    };

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

    const syncResult = await sql<{
      latest_sync: string | null;
    }>`
      SELECT MAX(last_synced)::text AS latest_sync
      FROM guild_members
      WHERE guild_id = ${guild.id}
    `;

    return jsonOk({
      guild,
      activeTb:
        activeTbResult.rows[0]
          ? {
              id: activeTbResult.rows[0].id,
              name: activeTbResult.rows[0].name || activeTbResult.rows[0].definition_name,
              status: activeTbResult.rows[0].status,
            }
          : null,
      lastRosterSync: syncResult.rows[0]?.latest_sync ?? null,
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Dashboard lookup failed',
      500
    );
  }
}
