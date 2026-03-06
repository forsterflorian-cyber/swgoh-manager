// scripts/migrate.ts

import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

async function migrate() {
  const sqlFile = fs.readFileSync(
    path.join(process.cwd(), 'sql', '001_extended_schema.sql'),
    'utf-8'
  );

  // Statements einzeln ausführen
  const statements = sqlFile
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      await sql.query(statement);
      console.log('✓ Executed:', statement.substring(0, 60) + '...');
    } catch (error: any) {
      console.error('✗ Failed:', statement.substring(0, 60));
      console.error('  Error:', error.message);
    }
  }

  console.log('\nMigration complete!');
}

migrate().catch(console.error);