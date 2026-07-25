// Audits `rarity` in src/data/figures.json against Pop Mart's own data, and
// optionally corrects it.
//
// Why this exists separately from core/pipeline.ts: dimoo and hirono were
// ingested by the pipeline, which reads Pop Mart's authoritative per-design
// secret flag (`toy.type === 2`), so their secrets are right. skullpanda and
// peachriot were curated by hand before the pipeline existed, and their secret
// figures sit in the catalog labeled `regular`. Fixing that does not need an
// ingest: the rows, ids, names and artwork are all fine. Running `run()` over
// those IPs would re-id and republish hundreds of hand-curated rows to change
// one string per set.
//
// So this drives the same adapter, reads the same flag, and writes nothing but
// `rarity` on rows it matched with certainty. It never inserts, deletes,
// renames or reorders a row, and never touches scraper/state/<ip>.json or any
// image. Anything it cannot match one-to-one is reported for a human instead
// of guessed at.
//
//   npm run audit:rarity -- --ip skullpanda            # report only
//   npm run audit:rarity -- --ip skullpanda --apply    # flip matched rows
import { parseArgs } from 'node:util';

import { discoverRosters } from './adapters/popmart';
import { getIpConfig } from './config/sources';
import { createLogger } from './core/logger';
import { slug } from './core/text';
import type { Logger, Rarity } from './core/types';
import { loadCatalog, saveCatalog, type StoredFigure } from './db/store';

const USAGE = `Usage: npm run audit:rarity -- --ip <slug> [options]

  --ip <slug>       IP to audit (required)
  --apply           write the corrected rarity back to src/data/figures.json
  --help            show this help`;

/** One figure as the source reports it. */
interface ScrapedFigure {
  readonly name: string;
  readonly rarity: Rarity;
}

/** One set as the source reports it, keyed by figure name slug. */
interface ScrapedSet {
  readonly setName: string;
  readonly figures: Map<string, ScrapedFigure>;
}

interface SetReport {
  readonly setName: string;
  readonly status: 'ok' | 'flip' | 'review';
  readonly lines: string[];
}

function parse() {
  const { values } = parseArgs({
    options: {
      ip: { type: 'string' },
      source: { type: 'string', default: 'popmart' },
      apply: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  return values;
}

/** The catalog's own rows for one IP, grouped set slug -> name slug -> rows.
 * Rows are kept as an array so a name that appears twice in one set is
 * reported rather than silently half-updated. */
function indexCatalog(rows: readonly StoredFigure[]): Map<string, Map<string, StoredFigure[]>> {
  const bySet = new Map<string, Map<string, StoredFigure[]>>();
  for (const row of rows) {
    const setKey = slug(row.set);
    let byName = bySet.get(setKey);
    if (!byName) {
      byName = new Map<string, StoredFigure[]>();
      bySet.set(setKey, byName);
    }
    const nameKey = slug(row.name);
    const existing = byName.get(nameKey);
    if (existing) {
      existing.push(row);
      continue;
    }
    byName.set(nameKey, [row]);
  }
  return bySet;
}

/** The brand label Pop Mart prints in front of every product title for an IP.
 * Taken from the same IP config the pipeline uses, so there is one place that
 * knows an IP slug maps to "SKULLPANDA". */
function brandLabelFor(ip: string): string {
  const ipConfig = getIpConfig(ip);
  const popmart = ipConfig.sources.find((s) => s.source === 'popmart');
  const label = popmart?.options?.brandLabel;
  if (typeof label !== 'string' || !label) {
    throw new Error(`IP "${ip}" has no popmart source with a brandLabel; see scraper/config/sources.ts`);
  }
  return label;
}

async function discoverSets(
  ip: string,
  log: Logger,
  wanted: (setSlug: string) => boolean,
): Promise<Map<string, ScrapedSet>> {
  const sets = new Map<string, ScrapedSet>();
  for await (const roster of discoverRosters({ brandLabel: brandLabelFor(ip), log, wanted })) {
    const setKey = slug(roster.set);
    let set = sets.get(setKey);
    if (!set) {
      set = { setName: roster.set, figures: new Map<string, ScrapedFigure>() };
      sets.set(setKey, set);
    }
    for (const figure of roster.figures) {
      set.figures.set(slug(figure.name), { name: figure.name, rarity: figure.rarity });
    }
  }
  return sets;
}

/** Compare one source set against the catalog's rows for it. Mutates `row.rarity`
 * on confidently matched rows and returns what changed, so `--apply` and the
 * report never disagree about what was done. */
function auditSet(
  setKey: string,
  scraped: ScrapedSet,
  catalogSets: ReadonlyMap<string, Map<string, StoredFigure[]>>,
): SetReport {
  const byName = catalogSets.get(setKey);
  if (!byName) {
    return {
      setName: scraped.setName,
      status: 'review',
      lines: [`not in the catalog at all (${scraped.figures.size} figures on the source)`],
    };
  }

  const lines: string[] = [];
  const flips: string[] = [];
  const matched = new Set<string>();

  for (const [nameKey, figure] of scraped.figures) {
    const rows = byName.get(nameKey);
    if (!rows) {
      lines.push(`source has "${figure.name}" (${figure.rarity}), catalog does not`);
      continue;
    }
    if (rows.length > 1) {
      lines.push(`"${figure.name}" matches ${rows.length} catalog rows, left alone`);
      continue;
    }
    matched.add(nameKey);
    const row = rows[0];
    const current = row.rarity ?? 'regular';
    if (current === figure.rarity) {
      continue;
    }
    flips.push(`${current} -> ${figure.rarity}  ${row.name}  (${row.id})`);
    row.rarity = figure.rarity;
  }

  for (const [nameKey, rows] of byName) {
    if (matched.has(nameKey)) {
      continue;
    }
    for (const row of rows) {
      lines.push(`catalog has "${row.name}", source does not`);
    }
  }

  let status: SetReport['status'] = 'ok';
  if (flips.length > 0) {
    status = 'flip';
  }
  if (lines.length > 0) {
    status = 'review';
  }
  return { setName: scraped.setName, status, lines: [...flips, ...lines] };
}

function secretNames(rows: readonly StoredFigure[]): string {
  const secrets = rows.filter((r) => r.rarity === 'secret').map((r) => r.name);
  if (secrets.length === 0) {
    return 'none';
  }
  return secrets.join(', ');
}

async function main() {
  const args = parse();
  if (args.help || !args.ip) {
    console.log(USAGE);
    process.exit(args.ip ? 0 : 1);
  }
  const ip = args.ip;
  const log = createLogger();

  const catalog = await loadCatalog();
  const mine = catalog.filter((row) => row.series === ip);
  if (mine.length === 0) {
    console.error(`No catalog rows with series "${ip}".`);
    process.exit(1);
  }
  const catalogSets = indexCatalog(mine);

  log.info(`Auditing rarity for ${ip} (${mine.length} rows, ${catalogSets.size} sets) against popmart`);
  const scrapedSets = await discoverSets(ip, log, (setSlug) => catalogSets.has(setSlug));
  log.info(`  ${scrapedSets.size} of them have a roster on popmart\n`);

  const reports: SetReport[] = [];
  let flipped = 0;
  for (const [setKey, scraped] of scrapedSets) {
    const report = auditSet(setKey, scraped, catalogSets);
    reports.push(report);
    flipped += report.lines.filter((l) => l.includes(' -> ')).length;
  }

  // Catalog sets the source never mentioned. Expected for anything that is not
  // a blind-box series (pendants, MEGA, blister packs, collaborations): the
  // adapter's title pattern excludes those on purpose, and they have no secret
  // to find. Listed so the exclusions stay a decision rather than an accident.
  const seen = new Set(scrapedSets.keys());
  const unseen: string[] = [];
  for (const [setKey, byName] of catalogSets) {
    if (seen.has(setKey)) {
      continue;
    }
    const rows = [...byName.values()].flat();
    unseen.push(`  ${rows[0].set}  (${rows.length} rows, catalog secret: ${secretNames(rows)})`);
  }

  for (const report of reports) {
    console.log(`[${report.status.toUpperCase()}] ${report.setName}`);
    for (const line of report.lines) {
      console.log(`    ${line}`);
    }
  }

  if (unseen.length > 0) {
    console.log('\nCatalog sets with no roster on popmart (not blind-box series, or delisted):');
    for (const line of unseen) {
      console.log(line);
    }
  }

  console.log(`\n${'='.repeat(48)}`);
  console.log(`Audit - IP: ${ip}`);
  console.log(`  sets ok        ${reports.filter((r) => r.status === 'ok').length}`);
  console.log(`  sets to flip   ${reports.filter((r) => r.status === 'flip').length}`);
  console.log(`  sets to review ${reports.filter((r) => r.status === 'review').length}`);
  console.log(`  sets no roster ${unseen.length}`);
  console.log(`  rarity flips   ${flipped}`);

  if (flipped === 0) {
    console.log('\nNothing to change.');
    return;
  }
  if (!args.apply) {
    console.log('\nReport only. Re-run with --apply to write these flips to src/data/figures.json.');
    return;
  }
  // auditSet mutated the rows in place, and `mine` holds the same object
  // references as `catalog`, so saving the catalog saves exactly those flips.
  await saveCatalog(catalog);
  console.log(`\nWrote ${flipped} rarity change(s) to src/data/figures.json.`);
}

main().catch((e: unknown) => {
  console.error((e as Error).stack ?? String(e));
  process.exit(1);
});
