import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { rows } = await sql`SELECT ally_code, player_name FROM members ORDER BY player_name ASC`;
    return NextResponse.json({ members: rows }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}