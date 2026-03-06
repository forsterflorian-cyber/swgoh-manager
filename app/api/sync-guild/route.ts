import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { guild_id } = await request.json();

    if (!guild_id) {
      return NextResponse.json({ error: "guild_id fehlt" }, { status: 400 });
    }

    // SWGOH.GG API abrufen - Korrigierter Endpunkt
    const response = await fetch(`https://swgoh.gg/api/guild/${guild_id}/`);
    
    if (!response.ok) {
      return NextResponse.json({ error: `Gilde nicht gefunden. API antwortet mit Status ${response.status}` }, { status: 404 });
    }

    const guildData = await response.json();
    
    // Fallback-Logik für unterschiedliche API-Strukturen
    const members = guildData.players || (guildData.data && guildData.data.members) || guildData.data || [];

    if (!members || members.length === 0) {
        return NextResponse.json({ error: "Gilden-Daten gefunden, aber keine Mitgliederliste erkannt." }, { status: 400 });
    }

    // Mitglieder in die Datenbank schreiben
    for (const member of members) {
      const allyCode = member.data ? member.data.ally_code : member.ally_code;
      const playerName = member.data ? member.data.name : member.member_name || member.name;

      if (allyCode) {
          await sql`
            INSERT INTO members (ally_code, player_name, guild_id)
            VALUES (${allyCode}, ${playerName}, ${guild_id})
            ON CONFLICT (ally_code) DO UPDATE
            SET player_name = EXCLUDED.player_name, guild_id = EXCLUDED.guild_id;
          `;
      }
    }

    return NextResponse.json({ message: `${members.length} Mitglieder erfolgreich synchronisiert.` }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ein interner Fehler ist aufgetreten";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}