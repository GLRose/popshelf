// The orchestrator: fetch (adapter.discover) -> normalize -> upsert -> images
// -> summary. Source-agnostic; it knows adapters only through SourceAdapter and
// the catalog only through CatalogWriter. A failure on one item is collected
// and reported, never fatal to the run.
import { getAdapter, getIpConfig } from '../config/sources';
import { CatalogWriter } from '../db/upsert';
import { ingestImages, type ImageIntent } from '../images/ingest';
import { normalizeItem } from '../normalize/normalize';
import { createFetcher, type FetcherStats } from './rateLimit';
import { createLogger } from './logger';
import type { Logger, RawItem } from './types';

export interface RunOptions {
  readonly ip: string;
  readonly source?: string;
  readonly dryRun: boolean;
  readonly limit?: number;
  readonly force: boolean;
  readonly full: boolean;
}

export interface Failure {
  readonly source: string;
  readonly sourceProductId?: string;
  readonly reason: string;
}

export interface PreviewRow {
  readonly action: 'inserted' | 'updated' | 'skipped';
  readonly id: string;
  readonly set: string;
  readonly name: string;
  readonly rarity: string;
  readonly hasImage: boolean;
}

export interface RunSummary {
  readonly ip: string;
  readonly found: number;
  readonly inserted: number;
  readonly updated: number;
  readonly skipped: number;
  readonly normalizeSkipped: number;
  readonly images: { downloaded: number; deduped: number; failed: number };
  readonly failures: readonly Failure[];
  readonly preview: readonly PreviewRow[];
  readonly durationMs: number;
  readonly requests: number;
  readonly cacheHits: number;
  readonly dryRun: boolean;
}

export async function run(opts: RunOptions): Promise<RunSummary> {
  const startedAt = Date.now();
  const log: Logger = createLogger();
  const ip = getIpConfig(opts.ip);

  const sources = opts.source ? ip.sources.filter((s) => s.source === opts.source) : ip.sources;
  if (sources.length === 0) {
    throw new Error(
      `IP "${ip.ip}" has no source "${opts.source}". Sources: ${ip.sources.map((s) => s.source).join(', ')}`,
    );
  }

  const stats: FetcherStats = { requests: 0, cacheHits: 0 };
  const fetcher = createFetcher(log, stats);
  const writer = new CatalogWriter(ip.ip);
  await writer.load();

  const failures: Failure[] = [];
  const preview: PreviewRow[] = [];
  let found = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let normalizeSkipped = 0;
  const images = { downloaded: 0, deduped: 0, failed: 0 };

  // `--limit` caps items across the whole run; once hit we stop pulling.
  const limitReached = () => opts.limit !== undefined && found >= opts.limit;

  for (const sourceConfig of sources) {
    const adapter = getAdapter(sourceConfig.source);
    const sourceWriter = writer.forSource(adapter.name);
    const scrapedAt = new Date().toISOString();
    const intents: ImageIntent[] = [];
    log.info(`Source: ${adapter.name}`);

    try {
      for await (const raw of adapter.discover({
        ip,
        sourceConfig,
        fetcher,
        log,
        full: opts.full,
        known: sourceWriter.known,
      })) {
        if (limitReached()) break;
        found++;

        const item: RawItem = { ...raw };
        const result = normalizeItem(item, {
          series: ip.ip,
          source: adapter.name,
          scrapedAt,
          resolveId: sourceWriter.resolveId,
        });
        if (!result.ok) {
          normalizeSkipped++;
          failures.push({ source: adapter.name, sourceProductId: result.sourceProductId, reason: result.reason });
          log.debug(`skip ${result.sourceProductId ?? '?'}: ${result.reason}`);
          continue;
        }

        const figure = result.figure;
        const action = sourceWriter.apply(figure);
        if (action === 'inserted') inserted++;
        else if (action === 'updated') updated++;
        else skipped++;

        preview.push({
          action,
          id: figure.id,
          set: figure.set,
          name: figure.name,
          rarity: figure.rarity,
          hasImage: Boolean(figure.imageUrl),
        });

        if (figure.imageUrl && !sourceConfig.skipImages) {
          intents.push({
            figureId: figure.id,
            sourceProductId: figure.provenance.sourceProductId,
            imageUrl: figure.imageUrl,
          });
        }
      }
    } catch (e) {
      // A source that blows up mid-crawl reports and yields the floor to the
      // next source instead of failing the whole run.
      failures.push({ source: adapter.name, reason: `discover failed: ${(e as Error).message}` });
      log.error(`source ${adapter.name} failed: ${(e as Error).message}`);
    }

    if (!opts.dryRun && !sourceConfig.skipImages && intents.length > 0) {
      const imgResult = await ingestImages(intents, {
        fetcher,
        writer: sourceWriter,
        log,
        force: opts.force,
      });
      images.downloaded += imgResult.downloaded;
      images.deduped += imgResult.deduped;
      images.failed += imgResult.failed;
      for (const f of imgResult.failures) {
        failures.push({ source: adapter.name, sourceProductId: f.figureId, reason: `image: ${f.reason}` });
      }
    }

    writer.markRun(adapter.name);
  }

  if (!opts.dryRun) {
    await writer.commit();
  }

  return {
    ip: ip.ip,
    found,
    inserted,
    updated,
    skipped,
    normalizeSkipped,
    images,
    failures,
    preview,
    durationMs: Date.now() - startedAt,
    requests: stats.requests,
    cacheHits: stats.cacheHits,
    dryRun: opts.dryRun,
  };
}
