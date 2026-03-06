// lib/services/guild-import.ts

import { sql } from '@vercel/postgres';

export class GuildImportService {
  /**
   * Gildenmitglieder von SWGOH.GG importieren
   */
  static async importFromSwgohGG(guildId: string, swgohGgGuildId: string) {
    const response = await fetch(
      `https://swgoh.gg/api/guild-profile/${swgohGgGuildId}/`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`SWGOH.GG error: ${response.status}`);
    }

    const data = await response.json();
    const members = data.data?.members || [];

    let imported = 0;

    for (const member of members) {
      await sql`
        INSERT INTO guild_members (id, guild_id, player_name, ally_code, galactic_power, last_synced)
        VALUES (
          gen_random_uuid(),
          ${guildId},
          ${member.player_name},
          ${member.ally_code.toString()},
          ${member.galactic_power || 0},
          NOW()
        )
        ON CONFLICT (guild_id, ally_code)
        DO UPDATE SET
          player_name = EXCLUDED.player_name,
          galactic_power = EXCLUDED.galactic_power,
          updated_at = NOW()
      `;
      imported++;
    }

    return { imported, total: members.length };
  }
}