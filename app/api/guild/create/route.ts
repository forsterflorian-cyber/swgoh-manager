// app/api/guild/create/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // User-ID laden
    const userResult = await sql`
      SELECT id FROM users WHERE email = ${session.user.email}
    `;

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = userResult.rows[0].id;

    const body = await request.json();
    const { name, swgohGgId } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Guild name is required' },
        { status: 400 }
      );
    }

    // Slug erstellen (URL-freundlich)
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Prüfen ob Slug schon existiert
    const existingSlug = await sql`
      SELECT id FROM guilds WHERE slug = ${slug}
    `;

    const finalSlug = existingSlug.rows.length > 0
      ? `${slug}-${Date.now().toString(36)}`
      : slug;

    // Guild erstellen
    const guildResult = await sql`
      INSERT INTO guilds (id, name, slug, swgoh_gg_id, owner_id)
      VALUES (gen_random_uuid(), ${name.trim()}, ${finalSlug}, ${swgohGgId || null}, ${userId})
      RETURNING id, name, slug
    `;

    const guild = guildResult.rows[0];

    // Owner-Permission setzen
    await sql`
      INSERT INTO permissions (id, user_id, guild_id, role, granted_by)
      VALUES (gen_random_uuid(), ${userId}, ${guild.id}, 'owner', ${userId})
    `;

    // Falls SWGOH.GG ID vorhanden → Mitglieder importieren
    if (swgohGgId) {
      try {
        const response = await fetch(
          `https://swgoh.gg/api/guild-profile/${swgohGgId}/`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (response.ok) {
          const data = await response.json();
          const members = data.data?.members || [];

          for (const member of members) {
            await sql`
              INSERT INTO guild_members (id, guild_id, player_name, ally_code, galactic_power, last_synced)
              VALUES (
                gen_random_uuid(),
                ${guild.id},
                ${member.player_name},
                ${member.ally_code.toString()},
                ${member.galactic_power || 0},
                NOW()
              )
              ON CONFLICT (guild_id, ally_code) DO NOTHING
            `;
          }
        }
      } catch (importError) {
        console.error('Guild member import failed:', importError);
        // Nicht abbrechen – Guild ist trotzdem erstellt
      }
    }

    return NextResponse.json({
      success: true,
      guild: {
        id: guild.id,
        name: guild.name,
        slug: guild.slug,
      },
    });
  } catch (error: any) {
    console.error('Guild create error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}