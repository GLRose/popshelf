// The contracts every layer of the pipeline agrees on. Nothing in here is
// source-specific: adapters depend on these types, and the pipeline depends on
// adapters only through SourceAdapter. Strict, no `any`.
import type { Figure } from '../../src/types';

export type Rarity = 'regular' | 'secret';

// --- Fetching -------------------------------------------------------------
// A rate-limited, cached, backoff-aware fetch surface. Adapters never call
// global fetch(); they go through this so politeness, caching and per-domain
// backoff are enforced in one place (see core/rateLimit.ts).
export interface FetchOptions {
  readonly headers?: Readonly<Record<string, string>>;
  /** Override the default cache TTL, or `false` to bypass the cache. */
  readonly cacheTtlMs?: number | false;
}

export interface Fetcher {
  text(url: string, opts?: FetchOptions): Promise<string>;
  /** Returns `unknown`; validate it with zod before use. */
  json(url: string, opts?: FetchOptions): Promise<unknown>;
  /** Never cached through the fetcher; the image pipeline dedupes by hash. */
  binary(url: string, opts?: FetchOptions): Promise<Buffer>;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

// --- Adapter surface ------------------------------------------------------
/** The raw, source-shaped record an adapter emits. Field extraction is the
 * adapter's job; cleaning, validation and mapping to the catalog schema is
 * normalize's. `data` carries anything extra an adapter wants to preserve. */
export interface RawItem {
  /** Stable id for this product *within its source*. Half of the upsert key. */
  readonly sourceProductId: string;
  /** Canonical page/record URL this item came from, for provenance. */
  readonly sourceUrl: string;
  readonly name: string;
  /** The set / blind-box wave this figure belongs to, as the source names it. */
  readonly set: string;
  /** Raw rarity marker, if any; normalize decides regular vs secret. */
  readonly rarity?: string;
  readonly year?: number | string;
  /** Primary source image URL, if the source exposes one. */
  readonly imageUrl?: string;
}

/** What the pipeline remembers about a previously-seen item, so a routine run
 * can skip unchanged ones and reuse the id it already assigned. */
export interface KnownItem {
  readonly figureId: string;
  readonly sourceUrl: string;
  readonly scrapedAt: string;
  /** Hash of the normalized catalog fields; unchanged hash ⇒ skip. */
  readonly contentHash: string;
  readonly imageUrl?: string;
  /** Content hash of the stored image; lets the image step dedupe. */
  readonly imageHash?: string;
}

export interface DiscoverContext {
  readonly ip: IpConfig;
  readonly sourceConfig: IpSourceConfig;
  readonly fetcher: Fetcher;
  readonly log: Logger;
  /** True on `--full`: adapters should re-crawl everything, not short-circuit. */
  readonly full: boolean;
  /** Prior state for this source, keyed by sourceProductId. */
  readonly known: ReadonlyMap<string, KnownItem>;
}

/** The one interface a new source must implement. Everything source-specific -
 * URLs, pagination, selectors, API shapes - lives behind this and nowhere
 * else. */
export interface SourceAdapter {
  /** Unique, stable source name; half of the upsert key and the state key. */
  readonly name: string;
  /** Domains this adapter hits, for per-domain rate limiting. */
  readonly domains: readonly string[];
  discover(ctx: DiscoverContext): AsyncIterable<RawItem>;
}

// --- Config ---------------------------------------------------------------
export interface IpSourceConfig {
  /** Must match a registered SourceAdapter.name. */
  readonly source: string;
  /** Skip image ingestion for this source (licensing/legal separability). */
  readonly skipImages?: boolean;
  /** Adapter-specific options (which sets, base URLs, ...); opaque to core. */
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface IpConfig {
  /** IP slug, e.g. 'dimoo'. Becomes Figure.series. */
  readonly ip: string;
  /** Display label, e.g. 'DIMOO'. */
  readonly label: string;
  /** Accent color for the app's series metadata. */
  readonly accent: string;
  readonly sources: readonly IpSourceConfig[];
}

// --- Normalization output -------------------------------------------------
export interface Provenance {
  readonly source: string;
  readonly sourceProductId: string;
  readonly sourceUrl: string;
  readonly scrapedAt: string;
}

/** A fully-normalized figure: the catalog fields the app needs, plus the
 * provenance and image intent the pipeline needs. */
export interface NormalizedFigure {
  readonly id: string;
  readonly series: string;
  readonly set: string;
  readonly name: string;
  readonly year?: number;
  readonly rarity: Rarity;
  readonly color: string;
  readonly imageUrl?: string;
  readonly provenance: Provenance;
}

/** The exact subset written to src/data/figures.json, matching the app's
 * Figure shape. Provenance never ships in the bundle; it lives in state/. */
export type CatalogFigure = Figure;
