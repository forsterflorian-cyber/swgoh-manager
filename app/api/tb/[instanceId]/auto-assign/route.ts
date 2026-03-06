// app/api/tb/[instanceId]/auto-assign/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const { instanceId } = await params;

    const session = await getServerSession(authOptions);
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { phase, zoneCode } = await request.json();

    if (!phase || !zoneCode) {
      return NextResponse.json(
        { error: 'phase and zoneCode are required' },
        { status: 400 }
      );
    }

    // Inline gap analysis statt interner fetch
    const instanceResult = await sql`
      SELECT ti.guild_id, td.id as definition_id
      FROM tb_instances ti
      JOIN tb_definitions td ON td.id = ti.tb_definition_id
      WHERE ti.id = ${instanceId}
    `;

    if (instanceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    const guildId = instanceResult.rows[0].guild_id;
    const defId = instanceResult.rows[0].definition_id;

    // Requirements laden
    const requirements = await sql`
      SELECT id, unit_base_id, unit_name, min_relic, min_rarity, total_needed
      FROM tb_requirements
      WHERE tb_definition_id = ${defId} AND phase = ${phase} AND zone_code = ${zoneCode}
    `;

    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];
    const usedKeys = new Set<string>();

    // Bestehende Zuweisungen tracken
    const existing = await sql`
      SELECT ta.ally_code, ta.unit_base_id
      FROM tb_assignments ta
      JOIN tb_requirements tr ON tr.id = ta.tb_requirement_id
      WHERE ta.tb_instance_id = ${instanceId} AND tr.phase = ${phase}
    `;
    for (const e of existing.rows) {
      usedKeys.add(`${e.ally_code}:${e.unit_base_id}`);
    }

    for (const req of requirements.rows) {
      // Wie viele Slots noch offen?
      const filledResult = await sql`
        SELECT COUNT(*) as cnt FROM tb_assignments
        WHERE tb_instance_id = ${instanceId} AND tb_requirement_id = ${req.id}
      `;
      const filled = parseInt(filledResult.rows[0].cnt);
      const slotsOpen = req.total_needed - filled;

      if (slotsOpen <= 0) continue;

      // Beste Kandidaten finden
      const candidates = await sql`
        SELECT rc.ally_code, rc.relic_tier, rc.rarity, gm.id as member_id, gm.player_name
        FROM roster_cache rc
        JOIN guild_members gm ON gm.ally_code = rc.ally_code AND gm.guild_id = rc.guild_id
        WHERE rc.guild_id = ${guildId}
          AND rc.unit_base_id = ${req.unit_base_id}
          AND rc.relic_tier >= ${req.min_relic}
          AND rc.rarity >= ${req.min_rarity}
        ORDER BY rc.relic_tier ASC
      `;

      let slotsAssigned = 0;
      for (const cand of candidates.rows) {
        if (slotsAssigned >= slotsOpen) break;

        const key = `${cand.ally_code}:${req.unit_base_id}`;
        if (usedKeys.has(key)) continue;

        try {
          await sql`
            INSERT INTO tb_assignments (
              id, tb_instance_id, tb_requirement_id, guild_member_id,
              ally_code, unit_base_id, assigned_by, status, player_relic_at_assignment
            ) VALUES (
              gen_random_uuid(), ${instanceId}, ${req.id}, ${cand.member_id},
              ${cand.ally_code}, ${req.unit_base_id}, ${userId},
              'assigned', ${cand.relic_tier}
            )
            ON CONFLICT DO NOTHING
          `;
          usedKeys.add(key);
          slotsAssigned++;
          assigned++;
        } catch (err: any) {
          errors.push(`${req.unit_name}: ${err.message}`);
        }
      }

      skipped += slotsOpen - slotsAssigned;
    }

    return NextResponse.json({
      success: true,
      data: { assigned, skipped, errors },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}