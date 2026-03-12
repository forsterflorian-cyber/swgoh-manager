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
      return jsonOk({ guild: null });
    }

    return jsonOk({
      guild: {
        ...result.rows[0],
        memberCount: toNumber(result.rows[0].memberCount),
      },
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Dashboard lookup failed',
      500
    );
  }
}
