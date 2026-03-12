import { NextRequest } from 'next/server';

import { sql } from '@vercel/postgres';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { toNumber } from '@/lib/utils/to-number';

export const runtime = 'nodejs';

type PublicAssignmentRow = {
  playerName: string;
  allyCode: string;
  unitName: string;
  minRelic: number;
  playerRelic: number;
  status: string;
  platoonNumber: string | number;
  slotNumber: string | number;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const guildResult = await sql<{ id: string; name: string; slug: string }>`
      SELECT g.id, g.name, g.slug
      FROM guilds g
      WHERE g.slug = ${slug}
    `;

    if (guildResult.rows.length === 0) {
      return jsonError('Guild not found', 404);
    }

    const guild = guildResult.rows[0];

    const tbResult = await sql<{
      instance_id: string;
      instance_name: string | null;
      status: string;
      tb_name: string;
      total_phases: string | number;
    }>`
      SELECT
        ti.id AS instance_id,
        ti.name AS instance_name,
        ti.status,
        td.name AS tb_name,
        td.total_phases
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

    if (tbResult.rows.length === 0) {
      return jsonOk({
        guild: { name: guild.name, slug: guild.slug },
        activeTB: null,
        assignments: {},
        members: [],
      });
    }

    const activeTB = tbResult.rows[0];

    const assignmentsResult = await sql<{
      ally_code: string;
      assignment_status: string;
      player_relic_at_assignment: string | number | null;
      player_name: string;
      phase_number: string | number;
      zone_name: string;
      required_unit_name: string | null;
      required_relic_tier: string | number | null;
      platoon_number: string | number;
      slot_number: string | number;
    }>`
      SELECT
        ta.ally_code,
        ta.status AS assignment_status,
        ta.player_relic_at_assignment,
        gm.player_name,
        tp.phase_number,
        tz.name AS zone_name,
        tps.unit_name AS required_unit_name,
        tps.required_relic_tier,
        tpl.platoon_number,
        tps.slot_number
      FROM tb_assignments ta
      JOIN guild_members gm ON gm.id = ta.guild_member_id
      JOIN tb_platoon_slots tps ON tps.id = ta.tb_platoon_slot_id
      JOIN tb_platoons tpl ON tpl.id = tps.tb_platoon_id
      JOIN tb_zones tz ON tz.id = tpl.tb_zone_id
      JOIN tb_phases tp ON tp.id = tz.tb_phase_id
      WHERE ta.tb_instance_id = ${activeTB.instance_id}
      ORDER BY tp.phase_number ASC, tz.sort_order ASC, tpl.sort_order ASC, tps.slot_number ASC
    `;

    const grouped: Record<string, Record<string, PublicAssignmentRow[]>> = {};
    for (const row of assignmentsResult.rows) {
      const phaseKey = `Phase ${row.phase_number}`;
      if (!grouped[phaseKey]) {
        grouped[phaseKey] = {};
      }
      if (!grouped[phaseKey][row.zone_name]) {
        grouped[phaseKey][row.zone_name] = [];
      }

      grouped[phaseKey][row.zone_name].push({
        playerName: row.player_name,
        allyCode: row.ally_code,
        unitName: row.required_unit_name || 'Unknown Unit',
        minRelic: toNumber(row.required_relic_tier),
        playerRelic: toNumber(row.player_relic_at_assignment),
        status: row.assignment_status,
        platoonNumber: row.platoon_number,
        slotNumber: row.slot_number,
      });
    }

    const membersResult = await sql<{
      player_name: string;
      ally_code: string;
      galactic_power: string | number | null;
      assignment_count: string | number;
    }>`
      SELECT
        gm.player_name,
        gm.ally_code,
        gm.galactic_power,
        COUNT(ta.id) AS assignment_count
      FROM guild_members gm
      LEFT JOIN tb_assignments ta
        ON ta.guild_member_id = gm.id
        AND ta.tb_instance_id = ${activeTB.instance_id}
      WHERE gm.guild_id = ${guild.id}
      GROUP BY gm.id, gm.player_name, gm.ally_code, gm.galactic_power
      ORDER BY gm.player_name ASC
    `;

    return jsonOk({
      guild: { name: guild.name, slug: guild.slug },
      activeTB: {
        name: activeTB.instance_name || activeTB.tb_name,
        status: activeTB.status,
        totalPhases: toNumber(activeTB.total_phases, 6),
      },
      assignments: grouped,
      members: membersResult.rows,
    });
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error ? error.message : 'Guild view failed',
      500
    );
  }
}
