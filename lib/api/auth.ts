import { sql } from '@vercel/postgres';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';

type SessionUser = {
  id?: string;
  email?: string | null;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser | undefined;
  const email = sessionUser?.email?.trim() || null;

  if (!email) {
    return null;
  }

  if (sessionUser?.id) {
    return {
      id: sessionUser.id,
      email,
    };
  }

  const result = await sql<{ id: string }>`
    SELECT id
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    email,
  };
}

export async function userCanAccessGuild(userId: string, guildId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1
    FROM permissions
    WHERE user_id = ${userId}
      AND guild_id = ${guildId}
    LIMIT 1
  `;

  return result.rows.length > 0;
}

export async function userCanAccessTbInstance(
  userId: string,
  tbInstanceId: string
): Promise<boolean> {
  const result = await sql`
    SELECT 1
    FROM tb_instances ti
    JOIN permissions p ON p.guild_id = ti.guild_id
    WHERE ti.id = ${tbInstanceId}
      AND p.user_id = ${userId}
    LIMIT 1
  `;

  return result.rows.length > 0;
}
