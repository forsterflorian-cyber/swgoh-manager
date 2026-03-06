// app/api/public/guild/[slug]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Guild laden
    const guildResult = await sql`
      SELECT g.id, g.name, g.slug
      FROM guilds g
      WHERE g.slug = ${params.slug}
    `;

    if (guildResult.rows.length === 0) {
      return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
    }

    const guild = guildResult.rows[0];

    // Aktive TB-Instanz laden
    const tbResult = await sql`
      SELECT
        ti.id as instance_id,
        ti.name as instance_name,
        ti.status,
        td.name as tb_name,
        td.short_code,
        td.total_phases
      FROM tb_instances ti
      JOIN tb_definitions td ON td.id = ti.tb_definition_id
      WHERE ti.guild_id = ${guild.id}
        AND ti.status IN ('planning', 'active')
      ORDER BY ti.created_at DESC
      LIMIT 1
    `;

    if (tbResult.rows.length === 0) {
      return NextResponse.json({
        guild: { name: guild.name, slug: guild.slug },
        activeTB: null,
        assignments: [],
      });
    }

    const activeTB = tbResult.rows[0];

    // Alle Zuweisungen für diese TB-Instanz laden
    const assignmentsResult = await sql`
      SELECT
        ta.id as assignment_id,
        ta.status as assignment_status,
        ta.ally_code,
        ta.unit_base_id,
        ta.player_relic_at_assignment,
        gm.player_name,
        tr.phase,
        tr.zone_name,
        tr.zone_code,
        tr.unit_name as required_unit_name,
        tr.min_relic,
        tr.is_platoon,
        tr.is_combat_mission
      FROM tb_assignments ta
      JOIN guild_members gm ON gm.id = ta.guild_member_id
      JOIN tb_requirements tr ON tr.id = ta.tb_requirement_id
      WHERE ta.tb_instance_id = ${activeTB.instance_id}
      ORDER BY tr.phase ASC, tr.zone_code ASC, tr.platoon_position ASC
    `;

    // Nach Phase > Zone gruppieren
    const grouped: Record<string, Record<string, any[]>> = {};

    for (const row of assignmentsResult.rows) {
      const phaseKey = `Phase ${row.phase}`;
      const zoneKey = row.zone_name;

      if (!grouped[phaseKey]) grouped[phaseKey] = {};
      if (!grouped[phaseKey][zoneKey]) grouped[phaseKey][zoneKey] = [];

      grouped[phaseKey][zoneKey].push({
        playerName: row.player_name,
        allyCode: row.ally_code,
        unitName: row.required_unit_name,
        minRelic: row.min_relic,
        playerRelic: row.player_relic_at_assignment,
        isPlatoon: row.is_platoon,
        isCombat: row.is_combat_mission,
        status: row.assignment_status,
      });
    }

    // Mitgliederliste laden
    const membersResult = await sql`
      SELECT
        gm.player_name,
        gm.ally_code,
        gm.galactic_power,
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
      activeTB: {
        name: activeTB.instance_name || activeTB.tb_name,
        tbName: activeTB.tb_name,
        status: activeTB.status,
        totalPhases: activeTB.total_phases,
      },
      assignments: grouped,
      members: membersResult.rows,
    });
  } catch (error: any) {
    console.error('Public guild API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}