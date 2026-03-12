type ParsedArgs = {
  tb: 'rote';
  force: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  let tb: ParsedArgs['tb'] = 'rote';
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--tb') {
      const nextValue = argv[index + 1];
      if (nextValue !== 'rote') {
        throw new Error(`Unsupported --tb value: ${nextValue || '(missing)'}`);
      }
      tb = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { tb, force };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { importTerritoryBattleReferenceData } = await import(
    '../lib/reference-data/tb-import.ts'
  );

  const result = await importTerritoryBattleReferenceData(args.tb, {
    force: args.force,
  });

  console.log(`TB: ${result.tbName} (${result.tbKey})`);
  console.log(`Skipped: ${result.skipped ? 'yes' : 'no'}`);
  console.log(`Forced: ${result.forced ? 'yes' : 'no'}`);
  console.log(`Source version: ${result.sourceVersion || 'n/a'}`);
  console.log('Source versions:');
  for (const [sourceName, sourceVersion] of Object.entries(result.sourceVersions)) {
    console.log(`  ${sourceName}: ${sourceVersion || 'n/a'}`);
  }
  console.log('Counts:');
  console.log(`  phases: ${result.counts.phases}`);
  console.log(`  zones: ${result.counts.zones}`);
  console.log(`  platoons: ${result.counts.platoons}`);
  console.log(`  slots: ${result.counts.slots}`);
}

main().catch((error) => {
  console.error('TB reference import failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
