import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { phase, zone, character_base_id, target_relic, assigned_ally_code } = await request.json();

    if (!character_base_id || !assigned_ally_code) {
      return NextResponse.json({ error: "Charakter und Spieler sind Pflichtfelder" }, { status: 400 });
    }

    await sql`
      INSERT INTO tb_assignments (phase, zone, character_base_id, target_relic, assigned_ally_code)
      VALUES (${phase}, ${zone}, ${character_base_id}, ${target_relic}, ${assigned_ally_code});
    `;

    return NextResponse.json({ message: "Zuweisung gespeichert" }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}