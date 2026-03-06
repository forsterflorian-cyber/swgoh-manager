// app/api/tb/[instanceId]/assign/route.ts

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
    const body = await request.json();
    const { requirementId, memberId } = body;

    if (!requirementId || !memberId) {
      return NextResponse.json(
        { error: 'requirementId and memberId are required' },
        { status: 400 }
      );
    }

    // Member laden
    const memberResult = await sql`
      SELECT gm.id, gm.ally_code, gm.player_name, gm.guild_id
      FROM guild_members gm
      WHERE gm.id = ${memberId}
    `;

    if (memberResult.rows.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const member = memberResult.rows[0];

    // Requirement laden
    const reqResult = await sql`
      SELECT tr.unit_base_id, tr.min_relic, tr.total_needed
      FROM tb_requirements tr
      WHERE tr.id = ${requirementId}
    `;

    if (reqResult.rows.length === 0) {
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    const req = reqResult.rows[0];

    // Prüfen ob Slot noch frei
    const existingCount = await sql`
      SELECT COUNT(*) as cnt
      FROM tb_assignments
      WHERE tb_instance_id = ${params.instanceId}
        AND tb_requirement_id = ${requirementId}
    `;

    if (parseInt(existingCount.rows[0].cnt) >= req.total_needed) {
      return NextResponse.json(
        { error: 'All slots for this requirement are already filled' },
        { status: 400 }
      );
    }

    // Spieler-Relic laden
    const rosterResult = await sql`
      SELECT relic_tier
      FROM roster_cache
      WHERE ally_code = ${member.ally_code}
        AND unit_base_id = ${req.unit_base_id}
        AND guild_id = ${member.guild_id}
    `;

    const relicTier = rosterResult.rows[0]?.relic_tier || 0;

    // Zuweisung erstellen
    await sql`
      INSERT INTO tb_assignments (
        id, tb_instance_id, tb_requirement_id, guild_member_id,
        ally_code, unit_base_id, assigned_by,
        status, player_relic_at_assignment
      ) VALUES (
        gen_random_uuid(), ${params.instanceId}, ${requirementId}, ${memberId},
        ${member.ally_code}, ${req.unit_base_id}, ${userId},
        'assigned', ${relicTier}
      )
      ON CONFLICT (tb_instance_id, tb_requirement_id, guild_member_id)
      DO UPDATE SET
        status = 'assigned',
        player_relic_at_assignment = ${relicTier},
        assigned_by = ${userId},
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Assignment error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { assignmentId } = body;

    if (!assignmentId) {
      return NextResponse.json(
        { error: 'assignmentId is required' },
        { status: 400 }
      );
    }

    await sql`
      DELETE FROM tb_assignments
      WHERE id = ${assignmentId}
        AND tb_instance_id = ${params.instanceId}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Unassign error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}