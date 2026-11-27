import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:3000';
const ACCOUNTS = [{ account: 'Cutie', allyCode: '112572244' }, { account: 'Eri', allyCode: '473975423' }];
const MAX_RETRIES = 12;
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const timeout = (ms) => AbortSignal.timeout(ms);

async function waitForComlink() {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(BASE + '/readyz', { signal: timeout(5000) });
      if (response.ok) return;
    } catch { /* container may still be starting */ }
    await pause(5000);
  }
  throw new Error('Comlink service is not ready; no snapshot will be written');
}

async function playerData(allyCode) {
  const response = await fetch(BASE + '/player', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: { allyCode }, enums: false }),
    signal: timeout(45000),
  });
  if (!response.ok) throw new Error('Comlink /player ' + allyCode + ': HTTP ' + response.status);
  const player = await response.json();
  if (String(player.allyCode) !== allyCode) throw new Error('Unexpected allyCode for ' + allyCode);
  if (!Array.isArray(player.rosterUnit) || player.rosterUnit.length < 100) {
    throw new Error('Missing/incomplete roster for ' + allyCode);
  }
  return player;
}

function normalizeRoster(rawUnits) {
  const units = rawUnits.filter(unit => Number(unit.combatType) !== 2).map(unit => {
    const rawRelic = unit.relic?.currentTier;
    const relicTier = rawRelic == null ? null : Number(rawRelic) - 2;
    return {
      definitionId: unit.definitionId,
      gearTier: Number(unit.currentTier),
      rarity: Number(unit.currentRarity),
      level: Number(unit.currentLevel),
      relicTier: Number.isInteger(relicTier) && relicTier >= 0 && relicTier <= 12 ? relicTier : null,
      rawRelicTier: rawRelic ?? null,
      equippedStatModCount: Array.isArray(unit.equippedStatMod) ? unit.equippedStatMod.length : null,
      ability: Array.isArray(unit.ability) ? unit.ability : [],
    };
  });
  if (units.length < 100 || units.some(u => !u.definitionId || !Number.isInteger(u.gearTier))) {
    throw new Error('Malformed roster; refusing to publish an incomplete snapshot');
  }
  return units;
}

await waitForComlink();
const accounts = {};
for (const { account, allyCode } of ACCOUNTS) {
  const player = await playerData(allyCode);
  accounts[account] = {
    allyCode, playerName: player.name,
    playerId: player.playerId,
    roster: normalizeRoster(player.rosterUnit),
    datacrons: Array.isArray(player.datacron) ? player.datacron : null,
    datacronVerified: Array.isArray(player.datacron),
    arena: player.playerRating ?? null,
  };
}
const now = new Date();
const snapshot = {
  checkedAt: now.toISOString(),
  source: 'SWGOH Comlink /player (live game API)',
  sourceMethod: 'GitHub Actions service container',
  notes: 'Relic tier is relic.currentTier - 2; 3v3/5v5 and datacron expiry are not independently validated by this snapshot; game API results can lag in-game upgrades.',
  accounts,
};
const dir = 'data/swgoh-weekly';
await mkdir(dir, { recursive: true });
const out = JSON.stringify(snapshot, null, 2) + '\n';
await writeFile(join(dir, 'latest.json'), out);
await writeFile(join(dir, now.toISOString().slice(0, 10) + '.json'), out);
console.log('Verified', Object.entries(accounts).map(([name, v]) => name + ': ' + v.roster.length + ' characters, ' + (v.datacrons?.length ?? '?') + ' datacrons').join('; '));
