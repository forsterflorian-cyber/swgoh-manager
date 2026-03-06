import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { guild_id } = await request.json();

    if (!guild_id) {
      return NextResponse.json({ error: "guild_id fehlt" }, { status: 400 });
    }

    // SWGOH.GG API abrufen
    const response = await fetch(`https://swgoh.gg/api/guild-profile/${guild_id}/`);
    if (!response.ok) {
      return NextResponse.json({ error: "Gilde nicht gefunden oder API nicht erreichbar" }, { status: 404 });
    }

    const guildData = await response.json();
    const members = guildData.data.members;

    // Mitglieder in die Vercel Postgres Datenbank schreiben
    for (const member of members) {
      await sql`
        INSERT INTO members (ally_code, player_name, guild_id)
        VALUES (${member.ally_code}, ${member.member_name}, ${guild_id})
        ON CONFLICT (ally_code) DO UPDATE
        SET player_name = EXCLUDED.player_name, guild_id = EXCLUDED.guild_id;
      `;
    }

    return NextResponse.json({ message: `${members.length} Mitglieder erfolgreich synchronisiert.` }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}