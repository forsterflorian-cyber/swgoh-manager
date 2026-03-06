import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS members (
          ally_code VARCHAR(9) PRIMARY KEY,
          player_name VARCHAR(50),
          guild_id VARCHAR(50)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS tb_assignments (
          id SERIAL PRIMARY KEY,
          phase VARCHAR(10),
          zone VARCHAR(50),
          character_base_id VARCHAR(50),
          target_relic INT,
          assigned_ally_code VARCHAR(9) REFERENCES members(ally_code)
      );
    `;
    return NextResponse.json({ message: "Datenbanktabellen erfolgreich erstellt" }, { status: 200 });
	} catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}