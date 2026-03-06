import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { guild_id, members } = await request.json();

    if (!guild_id || !members || !Array.isArray(members)) {
      return NextResponse.json({ error: "Fehlende oder ungültige Daten erhalten" }, { status: 400 });
    }

    let count = 0;
    
    // Mitglieder in die Datenbank schreiben
    for (const member of members) {
      const allyCode = member.data ? member.data.ally_code : member.ally_code;
      const playerName = member.data ? member.data.name : member.member_name || member.name;

      if (allyCode) {
          await sql`
            INSERT INTO members (ally_code, player_name, guild_id)
            VALUES (${String(allyCode)}, ${String(playerName)}, ${String(guild_id)})
            ON CONFLICT (ally_code) DO UPDATE
            SET player_name = EXCLUDED.player_name, guild_id = EXCLUDED.guild_id;
          `;
          count++;
      }
    }

    return NextResponse.json({ message: `${count} Mitglieder erfolgreich in der Datenbank gespeichert.` }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ein interner Datenbank-Fehler ist aufgetreten";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}