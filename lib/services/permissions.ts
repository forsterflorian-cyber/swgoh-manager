// lib/services/permissions.ts

import { sql } from '@vercel/postgres';

export async function checkGuildPermission(
  userId: string,
  guildId: string,
  allowedRoles: string[]
): Promise<boolean> {
  const result = await sql`
    SELECT role FROM permissions
    WHERE user_id = ${userId} AND guild_id = ${guildId}
  `;

  if (result.rows.length === 0) return false;
  return allowedRoles.includes(result.rows[0].role);
}

export async function getUserGuildRole(
  userId: string,
  guildId: string
): Promise<string | null> {
  const result = await sql`
    SELECT role FROM permissions
    WHERE user_id = ${userId} AND guild_id = ${guildId}
  `;
  return result.rows[0]?.role || null;
}