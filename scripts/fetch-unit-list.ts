// scripts/fetch-unit-list.ts
// Hilfsscript: Alle Unit-IDs von SWGOH.GG laden

async function fetchUnitList() {
  const res = await fetch('https://swgoh.gg/api/characters/');
  const characters = await res.json();

  console.log('base_id | name');
  console.log('--------|-----');

  for (const char of characters) {
    console.log(`${char.base_id} | ${char.name}`);
  }
}

fetchUnitList();