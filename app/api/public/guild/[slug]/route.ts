// app/api/public/guild/[slug]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const guildResult = await sql`
      SELECT g.id, g.name, g.slug FROM guilds g WHERE g.slug = ${slug}
    `;

    if (guildResult.rows.length === 0) {
      return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
    }

    const guild = guildResult.rows[0];

    const tbResult = await sql`
      SELECT ti.id as instance_id, ti.name as instance_name, ti.status,
             td.name as tb_name, td.total_phases
      FROM tb_instances ti
      JOIN tb_definitions td ON td.id = ti.tb_definition_id
      WHERE ti.guild_id = ${guild.id} AND ti.status IN ('planning', 'active')
      ORDER BY ti.created_at DESC LIMIT 1
    `;

    if (tbResult.rows.length === 0) {
      return NextResponse.json({
        guild: { name: guild.name, slug: guild.slug },
        activeTB: null, assignments: {}, members: [],
      });
    }

    const activeTB = tbResult.rows[0];

    const assignmentsResult = await sql`
      SELECT ta.ally_code, ta.status as assignment_status,
             ta.player_relic_at_assignment, gm.player_name,
             tr.phase, tr.zone_name, tr.unit_name as required_unit_name,
             tr.min_relic, tr.is_platoon, tr.is_combat_mission
      FROM tb_assignments ta
      JOIN guild_members gm ON gm.id = ta.guild_member_id
      JOIN tb_requirements tr ON tr.id = ta.tb_requirement_id
      WHERE ta.tb_instance_id = ${activeTB.instance_id}
      ORDER BY tr.phase ASC, tr.zone_name ASC
    `;

    const grouped: Record<string, Record<string, any[]>> = {};
    for (const row of assignmentsResult.rows) {
      const phaseKey = `Phase ${row.phase}`;
      if (!grouped[phaseKey]) grouped[phaseKey] = {};
      if (!grouped[phaseKey][row.zone_name]) grouped[phaseKey][row.zone_name] = [];
      grouped[phaseKey][row.zone_name].push({
        playerName: row.player_name, allyCode: row.ally_code,
        unitName: row.required_unit_name, minRelic: row.min_relic,
        playerRelic: row.player_relic_at_assignment,
        isPlatoon: row.is_platoon, status: row.assignment_status,
      });
    }

    const membersResult = await sql`
      SELECT gm.player_name, gm.ally_code, gm.galactic_power,
             COUNT(ta.id) as assignment_count
      FROM guild_members gm
      LEFT JOIN tb_assignments ta ON ta.guild_member_id = gm.id
        AND ta.tb_instance_id = ${activeTB.instance_id}
      WHERE gm.guild_id = ${guild.id}
      GROUP BY gm.id, gm.player_name, gm.ally_code, gm.galactic_power
      ORDER BY gm.player_name ASC
    `;

    return NextResponse.json({
      guild: { name: guild.name, slug: guild.slug },
      activeTB: { name: activeTB.instance_name || activeTB.tb_name, status: activeTB.status },
      assignments: grouped,
      members: membersResult.rows,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}