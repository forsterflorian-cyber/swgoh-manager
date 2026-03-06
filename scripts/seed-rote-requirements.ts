// scripts/seed-rote-requirements.ts

import { sql } from '@vercel/postgres';

interface Requirement {
  phase: number;
  zoneName: string;
  zoneCode: string;
  unitBaseId: string;
  unitName: string;
  minRelic: number;
  totalNeeded: number;
  isPlatoon: boolean;
  isCombat: boolean;
}

// Hier trägst du die echten ROTE-Anforderungen ein
// Dies ist ein Beispiel-Auszug – du musst die echten Daten
// z.B. von swgoh.gg/tb oder Community-Sheets übernehmen
const ROTE_REQUIREMENTS: Requirement[] = [
  // === PHASE 1 ===
  {
    phase: 1,
    zoneName: 'Coruscant - Jedi Operations',
    zoneCode: 'P1_CORUSCANT_JEDI',
    unitBaseId: 'JEDIKNIGHTANAKIN',
    unitName: 'Jedi Knight Anakin',
    minRelic: 5,
    totalNeeded: 1,
    isPlatoon: true,
    isCombat: false,
  },
  {
    phase: 1,
    zoneName: 'Coruscant - Jedi Operations',
    zoneCode: 'P1_CORUSCANT_JEDI',
    unitBaseId: 'AHSOKATANO',
    unitName: 'Ahsoka Tano',
    minRelic: 5,
    totalNeeded: 1,
    isPlatoon: true,
    isCombat: false,
  },

  // === PHASE 4 - ZEFFO ===
  {
    phase: 4,
    zoneName: 'Zeffo - Republic Operations',
    zoneCode: 'P4_ZEFFO_REP',
    unitBaseId: 'YOURUNITID_MUNDI',
    unitName: 'Ki-Adi-Mundi',
    minRelic: 7,
    totalNeeded: 2,
    isPlatoon: true,
    isCombat: false,
  },
  {
    phase: 4,
    zoneName: 'Zeffo - Republic Operations',
    zoneCode: 'P4_ZEFFO_REP',
    unitBaseId: 'YOURUNITID_SHAAKTI',
    unitName: 'Shaak Ti',
    minRelic: 7,
    totalNeeded: 2,
    isPlatoon: true,
    isCombat: false,
  },

  // ... WEITERE REQUIREMENTS HIER ERGÄNZEN
  // Tipp: Exportiere von einem Google Sheet oder
  //       scrape die Daten von swgoh.gg/tb
];

async function seedROTE() {
  console.log('Seeding ROTE requirements...\n');

  // TB Definition ID laden
  const tbDef = await sql`
    SELECT id FROM tb_definitions WHERE short_code = 'ROTE'
  `;

  if (tbDef.rows.length === 0) {
    console.error('ROTE TB Definition not found! Run the schema migration first.');
    return;
  }

  const tbDefId = tbDef.rows[0].id;
  let position = 0;

  for (const req of ROTE_REQUIREMENTS) {
    position++;

    try {
      await sql`
        INSERT INTO tb_requirements (
          id, tb_definition_id, phase, zone_name, zone_code,
          platoon_position, unit_base_id, unit_name,
          min_rarity, min_relic, total_needed,
          is_platoon, is_combat_mission
        ) VALUES (
          gen_random_uuid(), ${tbDefId}, ${req.phase}, ${req.zoneName}, ${req.zoneCode},
          ${position}, ${req.unitBaseId}, ${req.unitName},
          7, ${req.minRelic}, ${req.totalNeeded},
          ${req.isPlatoon}, ${req.isCombat}
        )
      `;
      console.log(`  ✓ Phase ${req.phase} | ${req.zoneCode} | ${req.unitName} (R${req.minRelic})`);
    } catch (error: any) {
      console.error(`  ✗ ${req.unitName}: ${error.message}`);
    }
  }

  console.log(`\nDone! Seeded ${position} requirements.`);
}

seedROTE().catch(console.error);