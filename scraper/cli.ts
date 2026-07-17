// Command-line entry point. Parses flags, runs the pipeline, and prints a
// concise progress log plus an end-of-run summary. See README.md.
//
//   npm run scrape -- --ip <slug> [--source <name>] [--dry-run]
//                     [--limit <n>] [--force] [--full]
import { parseArgs } from 'node:util';
import { run, type RunSummary } from './core/pipeline';

const USAGE = `Usage: npm run scrape -- --ip <slug> [options]

  --ip <slug>       IP to ingest (required)
  --source <name>   restrict to one source
  --dry-run         fetch + normalize + print what would be written; touch nothing
  --limit <n>       cap items (for testing)
  --force           re-download/re-process images even if hashes match
  --full            full re-crawl instead of the default incremental run
  --help            show this help`;

function parse() {
  const { values } = parseArgs({
    options: {
      ip: { type: 'string' },
      source: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
      force: { type: 'boolean', default: false },
      full: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  return values;
}

function printPreview(summary: RunSummary): void {
  if (summary.preview.length === 0) return;
  const mark: Record<string, string> = { inserted: '+', updated: '~', skipped: '=' };
  console.log('\nWould write:');
  console.log('  op  rarity   set / name');
  for (const row of summary.preview) {
    const img = row.hasImage ? ' [img]' : '';
    console.log(`  ${mark[row.action]}   ${row.rarity.padEnd(7)}  ${row.set} / ${row.name}${img}`);
  }
}

function printSummary(summary: RunSummary): void {
  const secs = summary.durationMs / 1000;
  const perMin = secs > 0 ? Math.round((summary.found / secs) * 60) : summary.found;
  const cacheRate = summary.requests + summary.cacheHits > 0
    ? Math.round((summary.cacheHits / (summary.requests + summary.cacheHits)) * 100)
    : 0;

  console.log(`\n${'='.repeat(48)}`);
  console.log(`Run summary${summary.dryRun ? ' (dry-run: nothing written)' : ''} - IP: ${summary.ip}`);
  console.log(`  found      ${summary.found}`);
  console.log(`  inserted   ${summary.inserted}`);
  console.log(`  updated    ${summary.updated}`);
  console.log(`  skipped    ${summary.skipped} (unchanged)`);
  console.log(`  normalize  ${summary.normalizeSkipped} skipped (invalid)`);
  console.log(`  images     ${summary.images.downloaded} downloaded, ${summary.images.deduped} deduped, ${summary.images.failed} failed`);
  console.log(`  throughput ${perMin} items/min, cache hit rate ${cacheRate}% (${summary.requests} requests)`);
  console.log(`  duration   ${secs.toFixed(1)}s`);

  if (summary.failures.length > 0) {
    console.log(`\n  ${summary.failures.length} failure(s):`);
    for (const f of summary.failures) {
      console.log(`    - [${f.source}] ${f.sourceProductId ?? ''} ${f.reason}`.replace(/\s+/g, ' '));
    }
  }
}

async function main() {
  const args = parse();
  if (args.help || !args.ip) {
    console.log(USAGE);
    process.exit(args.ip ? 0 : 1);
  }

  const limit = args.limit === undefined ? undefined : Number(args.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive integer, got "${args.limit}"`);
    process.exit(1);
  }

  const summary = await run({
    ip: args.ip,
    source: args.source,
    dryRun: args['dry-run'],
    limit,
    force: args.force,
    full: args.full,
  });

  if (summary.dryRun) printPreview(summary);
  printSummary(summary);

  process.exit(summary.failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
