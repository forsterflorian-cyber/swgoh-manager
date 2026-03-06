// lib/services/roster-sync.ts

import { sql } from '@vercel/postgres';

interface SwgohGGUnit {
  data: {
    base_id: string;
    name: string;
    rarity: number;
    gear_level: number;
    relic_tier: number;
    power: number;
    is_galactic_legend: boolean;
    zeta_abilities: string[];
    omicron_abilities: string[];
    stats: { speed?: number };
  };
}

export class RosterSyncService {

  /**
   * Sync eines einzelnen Spielers
   */
  static async syncPlayer(allyCode: string, guildId: string): Promise<number> {
    // Prüfen ob Cache noch gültig (24h)
    const cacheCheck = await sql`
      SELECT MAX(last_updated) as latest
      FROM roster_cache
      WHERE ally_code = ${allyCode} AND guild_id = ${guildId}
    `;

    const latest = cacheCheck.rows[0]?.latest;
    if (latest) {
      const age = Date.now() - new Date(latest).getTime();
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      if (age < TWENTY_FOUR_HOURS) {
        console.log(`Cache for ${allyCode} is still valid (${Math.round(age / 3600000)}h old)`);
        return 0;
      }
    }

    // SWGOH.GG API aufrufen
    const cleanAllyCode = allyCode.replace(/-/g, '');
    const response = await fetch(
      `https://swgoh.gg/api/player/${cleanAllyCode}/`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 0 },
      }
    );

    if (!response.ok) {
      throw new Error(`SWGOH.GG API error: ${response.status} for ally code ${allyCode}`);
    }

    const playerData = await response.json();
    const units = playerData.units || [];

    let synced = 0;

    // Batch-Upsert
    for (const unit of units) {
      const d = unit.data;
      // relic_tier von SWGOH.GG ist oft base + offset
      // Wert 1 = kein Relic, 2 = R0, 3 = R1, etc.
      const relicTier = d.relic_tier ? Math.max(0, d.relic_tier - 2) : 0;
      const zetaCount = d.zeta_abilities?.length || 0;
      const omicronCount = d.omicron_abilities?.length || 0;

      await sql`
        INSERT INTO roster_cache (
          id, ally_code, guild_id, unit_base_id, unit_name,
          rarity, gear_level, relic_tier, galactic_power,
          is_galactic_legend, zeta_count, omicron_count, speed,
          last_updated
        ) VALUES (
          gen_random_uuid(), ${allyCode}, ${guildId}, ${d.base_id}, ${d.name},
          ${d.rarity || 0}, ${d.gear_level || 0}, ${relicTier}, ${d.power || 0},
          ${d.is_galactic_legend || false}, ${zetaCount}, ${omicronCount},
          ${d.stats?.['1'] || 0}, NOW()
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
          speed = EXCLUDED.speed,
          last_updated = NOW()
      `;

      synced++;
    }

    return synced;
  }

  /**
   * Gesamte Gilde synchronisieren
   */
  static async syncGuild(guildId: string): Promise<{
    total: number;
    synced: number;
    errors: string[];
  }> {
    const members = await sql`
      SELECT ally_code, player_name
      FROM guild_members
      WHERE guild_id = ${guildId}
    `;

    let synced = 0;
    const errors: string[] = [];

    for (const member of members.rows) {
      try {
        const count = await this.syncPlayer(member.ally_code, guildId);
        if (count > 0) {
          synced++;
          // Rate limiting: 2 Sekunden zwischen Requests
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        errors.push(`${member.player_name} (${member.ally_code}): ${error.message}`);
      }
    }

    return { total: members.rows.length, synced, errors };
  }
}