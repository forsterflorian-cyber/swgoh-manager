import { NextResponse } from 'next/server';
import { db } from '@vercel/postgres';

import { getAuthenticatedUser } from '@/lib/api/auth';

function buildUrl(request: Request, path: string) {
  return new URL(path, request.url);
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.redirect(buildUrl(request, '/login'), 303);
  }

  const client = await db.connect();

  try {
    const linkedGuild = await client.sql<{ guild_id: string | null }>`
      SELECT guild_id
      FROM users
      WHERE id = ${user.id}
      LIMIT 1
    `;

    const guildId = linkedGuild.rows[0]?.guild_id ?? null;

    if (guildId) {
      return NextResponse.redirect(
        buildUrl(request, '/dashboard?error=account_delete_blocked'),
        303,
      );
    }

    await client.sql`BEGIN`;

    await client.sql`
      DELETE FROM permissions
      WHERE user_id = ${user.id}
    `;

    await client.sql`
      DELETE FROM users
      WHERE id = ${user.id}
    `;

    await client.sql`COMMIT`;

    return NextResponse.redirect(
      buildUrl(request, '/account-deleted'),
      303,
    );
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Account delete failed', error);

    return NextResponse.redirect(
      buildUrl(request, '/dashboard?error=account_delete_failed'),
      303,
    );
  } finally {
    client.release();
  }
}