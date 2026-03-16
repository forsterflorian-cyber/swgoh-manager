import { NextResponse } from 'next/server';
import { db, sql } from '@vercel/postgres';

import { getAuthenticatedUser } from '@/lib/api/auth';
import {
  getPrimaryGuildSettingsForUser,
  isGuildManagerRole,
} from '@/lib/services/guild-settings';

type RouteContext = {
  params: Promise<{ guildId: string }>;
};

function buildUrl(request: Request, path: string) {
  return new URL(path, request.url);
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.redirect(buildUrl(request, '/login'));
  }

  const { guildId } = await params;

  const guild = await getPrimaryGuildSettingsForUser(user.id);

  if (!guild || guild.id !== guildId) {
    return NextResponse.redirect(
      buildUrl(request, '/settings/guild?error=guild_not_found'),
    );
  }

  if (!isGuildManagerRole(guild.role)) {
    return NextResponse.redirect(
      buildUrl(request, '/settings/guild?error=forbidden'),
    );
  }

  const client = await db.connect();

  try {
    await client.sql`BEGIN`;

    await client.sql`
      UPDATE users
      SET guild_id = NULL
      WHERE guild_id = ${guildId}
    `;

    await client.sql`
      DELETE FROM permissions
      WHERE guild_id = ${guildId}
    `;

    await client.sql`
      DELETE FROM guild_upgrade_assignments
      WHERE guild_id = ${guildId}
    `;

    await client.sql`
      DELETE FROM tb_assignments
      WHERE tb_instance_id IN (
        SELECT id
        FROM tb_instances
        WHERE guild_id = ${guildId}
      )
      OR guild_member_id IN (
        SELECT id
        FROM guild_members
        WHERE guild_id = ${guildId}
      )
    `;

    await client.sql`
      DELETE FROM tb_instances
      WHERE guild_id = ${guildId}
    `;

    await client.sql`
      DELETE FROM player_roster
      WHERE guild_id = ${guildId}
    `;

    await client.sql`
      DELETE FROM roster_cache
      WHERE guild_id = ${guildId}
    `;

    await client.sql`
      DELETE FROM guild_members
      WHERE guild_id = ${guildId}
    `;

    await client.sql`
      DELETE FROM guilds
      WHERE id = ${guildId}
    `;

    await client.sql`COMMIT`;

    return NextResponse.redirect(buildUrl(request, '/dashboard?deleted=1'));
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Guild delete failed', error);

    return NextResponse.redirect(
      buildUrl(request, '/settings/guild?error=delete_failed'),
    );
  } finally {
    client.release();
  }
}