import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Wir holen alle Mitglieder dieser Gilde aus der Datenbank
    const membersResult = await sql`
      SELECT id, player_name, ally_code, galactic_power, last_synced
      FROM guild_members
      WHERE guild_id = ${guildId}
      ORDER BY galactic_power DESC
    `;

    return NextResponse.json({
      success: true,
      members: membersResult.rows,
    });
  } catch (error: any) {
    console.error('Members API error:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Mitglieder' },
      { status: 500 }
    );
  }
}