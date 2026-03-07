import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await sql`
      SELECT 
        g.id, 
        g.name, 
        g.swgoh_gg_id, 
        g.slug,
        (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) as "memberCount"
      FROM users u
      JOIN guilds g ON u.guild_id = g.id
      WHERE u.email = ${session.user.email}
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ guild: null });
    }

    return NextResponse.json({ guild: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}