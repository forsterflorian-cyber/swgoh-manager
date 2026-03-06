// app/api/guild/[guildId]/sync/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;

    const session = await getServerSession(authOptions);
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mitglieder der Gilde laden
    const members = await sql`
      SELECT ally_code, player_name
      FROM guild_members
      WHERE guild_id = ${guildId}
    `;

    let synced = 0;
    const errors: string[] = [];

    for (const member of members.rows) {
      try {
        // Cache-Alter prüfen
        const cacheCheck = await sql`
          SELECT MAX(last_updated) as latest
          FROM roster_cache
          WHERE ally_code = ${member.ally_code} AND guild_id = ${guildId}
        `;

        const latest = cacheCheck.rows[0]?.latest;
        if (latest) {
          const age = Date.now() - new Date(latest).getTime();
          if (age < 24 * 60 * 60 * 1000) continue; // Noch gültig
        }

        // SWGOH.GG API aufrufen
        const cleanCode = member.ally_code.replace(/-/g, '');
        const response = await fetch(
          `https://swgoh.gg/api/player/${cleanCode}/`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (!response.ok) {
          errors.push(`${member.player_name}: API ${response.status}`);
          continue;
        }

        const playerData = await response.json();
        const units = playerData.units || [];

        for (const unit of units) {
          const d = unit.data;
          const relicTier = d.relic_tier ? Math.max(0, d.relic_tier - 2) : 0;

          await sql`
            INSERT INTO roster_cache (
              id, ally_code, guild_id, unit_base_id, unit_name,
              rarity, gear_level, relic_tier, galactic_power,
              is_galactic_legend, zeta_count, omicron_count, speed,
              last_updated
            ) VALUES (
              gen_random_uuid(), ${member.ally_code}, ${guildId},
              ${d.base_id}, ${d.name},
              ${d.rarity || 0}, ${d.gear_level || 0}, ${relicTier}, ${d.power || 0},
              ${d.is_galactic_legend || false},
              ${d.zeta_abilities?.length || 0},
              ${d.omicron_abilities?.length || 0},
              ${0}, NOW()
            )
            ON CONFLICT (ally_code, unit_base_id)
            DO UPDATE SET
              unit_name = EXCLUDED.unit_name,
              rarity = EXCLUDED.rarity,
              gear_level = EXCLUDED.gear_level,
              relic_tier = EXCLUDED.relic_tier,
              galactic_power = EXCLUDED.galactic_power,
              is_galactic_legend = EXCLUDED.is_galactic_legend,
              zeta_count = EXCLUDED.zeta_count,
              omicron_count = EXCLUDED.omicron_count,
              last_updated = NOW()
          `;
        }

        synced++;
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err: any) {
        errors.push(`${member.player_name}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { total: members.rows.length, synced, errors },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}