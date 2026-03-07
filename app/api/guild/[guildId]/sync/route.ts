import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: NextRequest, { params }: { params: Promise<{ guildId: string }> }) {
  try {
    const { guildId } = await params;
    const body = await request.json();
    const { mode, members, playerData, allyCode } = body;

    // MODUS 1: Mitgliederliste speichern
    if (mode === 'init' && members) {
      for (const m of members) {
        await sql`
          INSERT INTO guild_members (id, guild_id, player_name, ally_code, galactic_power)
          VALUES (gen_random_uuid(), ${guildId}, ${m.player_name}, ${m.ally_code.toString()}, ${m.galactic_power})
          ON CONFLICT (guild_id, ally_code) DO UPDATE SET galactic_power = EXCLUDED.galactic_power;
        `;
      }
      return NextResponse.json({ success: true });
    }

    // MODUS 2: Einzel-Roster speichern
    if (mode === 'player' && playerData && allyCode) {
      for (const unit of playerData.units) {
        const d = unit.data;
        const relicTier = d.relic_tier ? Math.max(0, d.relic_tier - 2) : 0;
        await sql`
          INSERT INTO roster_cache (id, ally_code, guild_id, unit_base_id, unit_name, rarity, gear_level, relic_tier, galactic_power, is_galactic_legend, zeta_count, omicron_count, speed, last_updated)
          VALUES (gen_random_uuid(), ${allyCode}, ${guildId}, ${d.base_id}, ${d.name}, ${d.rarity}, ${d.gear_level}, ${relicTier}, ${d.power}, ${d.is_galactic_legend || false}, ${d.zeta_abilities?.length || 0}, ${d.omicron_abilities?.length || 0}, 0, NOW())
          ON CONFLICT (ally_code, unit_base_id) DO UPDATE SET gear_level = EXCLUDED.gear_level, relic_tier = EXCLUDED.relic_tier, last_updated = NOW();
        `;
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}