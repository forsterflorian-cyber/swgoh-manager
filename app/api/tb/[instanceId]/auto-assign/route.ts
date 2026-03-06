// app/api/tb/[instanceId]/auto-assign/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export async function POST(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  try {
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

    // Gap-Analyse über die gap-Route holen (intern)
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const gapRes = await fetch(
      `${baseUrl}/api/tb/${params.instanceId}/gap?phase=${phase}&zone=${zoneCode}`,
      { headers: { cookie: '' } }
    );
    const gapData = await gapRes.json();

    if (!gapData.success) {
      return NextResponse.json(
        { error: 'Gap analysis failed' },
        { status: 500 }
      );
    }

    const analysis = gapData.data;
    let assigned = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Track welche Spieler+Units vergeben sind
    const usedKeys = new Set<string>();

    // Bestehende Zuweisungen tracken
    for (const unit of analysis.units) {
      for (const ap of unit.assignedPlayers) {
        usedKeys.add(`${ap.allyCode}:${unit.requirement.unitBaseId}`);
      }
    }

    // Nach Dringlichkeit: Units mit wenigsten Kandidaten zuerst
    const sortedUnits = [...analysis.units]
      .filter((u: any) => u.gapCount > 0)
      .sort((a: any, b: any) => a.qualifiedPlayers.length - b.qualifiedPlayers.length);

    for (const unit of sortedUnits) {
      for (let i = 0; i < unit.gapCount; i++) {
        const candidate = unit.qualifiedPlayers.find(
          (p: any) => !usedKeys.has(`${p.allyCode}:${unit.requirement.unitBaseId}`)
        );

        if (!candidate) {
          skipped++;
          continue;
        }

        try {
          // Member laden
          const memberResult = await sql`
            SELECT gm.id, gm.ally_code, gm.guild_id
            FROM guild_members gm WHERE gm.id = ${candidate.memberId}
          `;

          if (memberResult.rows.length === 0) {
            skipped++;
            continue;
          }

          const member = memberResult.rows[0];

          // Relic laden
          const rosterResult = await sql`
            SELECT relic_tier FROM roster_cache
            WHERE ally_code = ${member.ally_code}
              AND unit_base_id = ${unit.requirement.unitBaseId}
              AND guild_id = ${member.guild_id}
          `;

          const relicTier = rosterResult.rows[0]?.relic_tier || 0;

          // Zuweisen
          await sql`
            INSERT INTO tb_assignments (
              id, tb_instance_id, tb_requirement_id, guild_member_id,
              ally_code, unit_base_id, assigned_by,
              status, player_relic_at_assignment
            ) VALUES (
              gen_random_uuid(),
              ${params.instanceId},
              ${unit.requirement.requirementId},
              ${candidate.memberId},
              ${candidate.allyCode},
              ${unit.requirement.unitBaseId},
              ${userId},
              'assigned',
              ${relicTier}
            )
            ON CONFLICT (tb_instance_id, tb_requirement_id, guild_member_id)
            DO NOTHING
          `;

          assigned++;
          usedKeys.add(`${candidate.allyCode}:${unit.requirement.unitBaseId}`);
        } catch (err: any) {
          errors.push(`${unit.requirement.unitName}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { assigned, skipped, errors },
    });
  } catch (error: any) {
    console.error('Auto-assign error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}