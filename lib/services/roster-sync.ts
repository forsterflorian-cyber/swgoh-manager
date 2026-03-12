import { sql } from '@vercel/postgres';
import type { VercelPoolClient } from '@vercel/postgres';

import { fetchPlayerRoster } from '@/lib/services/swgohgg-client';

export class RosterSyncService {
  static async syncPlayer(allyCode: string, guildId: string): Promise<number> {
    const normalizedAllyCode = allyCode.replace(/\D/g, '');

    const cacheCheck = await sql`
      SELECT MAX(last_updated) AS latest
      FROM roster_cache
      WHERE ally_code = ${normalizedAllyCode} AND guild_id = ${guildId}
    `;

    const latest = cacheCheck.rows[0]?.latest;
    if (latest) {
      const age = Date.now() - new Date(latest).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      if (age < twentyFourHours) {
        console.log(
          `Cache for ${normalizedAllyCode} is still valid (${Math.round(age / 3600000)}h old)`
        );
        return 0;
      }
    }

    const units = await fetchPlayerRoster(normalizedAllyCode);
    const client = (await sql.connect()) as VercelPoolClient;
    let synced = 0;

    try {
      await client.query('BEGIN');

      await client.sql`
        DELETE FROM roster_cache
        WHERE ally_code = ${normalizedAllyCode} AND guild_id = ${guildId}
      `;

      for (const unit of units) {
        const relicTier = unit.relic_tier ? Math.max(0, unit.relic_tier - 2) : 0;
        const zetaCount = unit.zeta_abilities?.length || 0;
        const omicronCount = unit.omicron_abilities?.length || 0;

        await client.sql`
          INSERT INTO roster_cache (
            id,
            ally_code,
            guild_id,
            unit_base_id,
            unit_name,
            rarity,
            gear_level,
            relic_tier,
            galactic_power,
            is_galactic_legend,
            zeta_count,
            omicron_count,
            speed,
            last_updated
          ) VALUES (
            gen_random_uuid(),
            ${normalizedAllyCode},
            ${guildId},
            ${unit.base_id},
            ${unit.name || unit.base_id},
            ${unit.rarity || 0},
            ${unit.gear_level || 0},
            ${relicTier},
            ${unit.power || unit.galactic_power || 0},
            ${unit.is_galactic_legend || false},
            ${zetaCount},
            ${omicronCount},
            0,
            NOW()
          )
        `;

        synced += 1;
      }

      await client.sql`
        UPDATE guild_members
        SET last_synced = NOW(), updated_at = NOW()
        WHERE guild_id = ${guildId} AND ally_code = ${normalizedAllyCode}
      `;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return synced;
  }
}
