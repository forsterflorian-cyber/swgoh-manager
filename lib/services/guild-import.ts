import { sql } from '@vercel/postgres';

import { fetchGuildMembers } from '@/lib/services/swgohgg-client';

export class GuildImportService {
  static async importFromSwgohGG(guildId: string, swgohGgGuildId: string) {
    const members = await fetchGuildMembers(swgohGgGuildId);

    let imported = 0;

    for (const member of members) {
      await sql`
        INSERT INTO guild_members (id, guild_id, player_name, ally_code, galactic_power, last_synced)
        VALUES (
          gen_random_uuid(),
          ${guildId},
          ${member.player_name},
          ${member.ally_code},
          ${member.galactic_power},
          NULL
        )
        ON CONFLICT (guild_id, ally_code)
        DO UPDATE SET
          player_name = EXCLUDED.player_name,
          galactic_power = EXCLUDED.galactic_power,
          updated_at = NOW()
      `;

      imported += 1;
    }

    return { imported, total: members.length };
  }
}
