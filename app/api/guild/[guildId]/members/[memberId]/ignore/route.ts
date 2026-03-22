import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { isGuildManagerRole } from '@/lib/services/guild-settings';

type RouteParams = { guildId: string; memberId: string };
type RouteContext = { params: Promise<RouteParams> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { guildId, memberId } = await params;

    // Check if user has permission to manage this guild
    const permissionResult = await sql`
      SELECT p.role::text AS role
      FROM permissions p
      WHERE p.user_id = ${user.id}
        AND p.guild_id = ${guildId}
      LIMIT 1
    `;

    const role = permissionResult.rows[0]?.role;
    if (!role || !isGuildManagerRole(role as any)) {
      return NextResponse.json(
        { error: 'Only guild owners, admins, and officers can ignore members' },
        { status: 403 }
      );
    }

    // Check if member exists and belongs to this guild
    const memberResult = await sql`
      SELECT id, ignored_at
      FROM guild_members
      WHERE id = ${memberId}
        AND guild_id = ${guildId}
      LIMIT 1
    `;

    if (memberResult.rows.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const member = memberResult.rows[0];
    const isCurrentlyIgnored = member.ignored_at !== null;

    // Toggle ignore status
    if (isCurrentlyIgnored) {
      // Unignore the member
      await sql`
        UPDATE guild_members
        SET ignored_at = NULL
        WHERE id = ${memberId}
          AND guild_id = ${guildId}
      `;
    } else {
      // Ignore the member
      await sql`
        UPDATE guild_members
        SET ignored_at = NOW()
        WHERE id = ${memberId}
          AND guild_id = ${guildId}
      `;
    }

    return NextResponse.json({
      success: true,
      action: isCurrentlyIgnored ? 'unignored' : 'ignored',
      memberId,
    });
  } catch (error) {
    console.error('Ignore member error:', error);
    return NextResponse.json(
      { error: 'Failed to update member ignore status' },
      { status: 500 }
    );
  }
}