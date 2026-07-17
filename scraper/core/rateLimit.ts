// Politeness + resilience for every network request the pipeline makes.
// Throughput comes from breadth (many domains at once) and caching, never from
// hammering one domain: each domain gets a small concurrency cap, a jittered
// inter-request delay, exponential backoff on refusal, and a cooldown that
// pauses a domain that starts refusing while other domains keep going.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CACHE_DIR } from './paths';
import { shortHash } from './text';
import type { FetchOptions, Fetcher, Logger } from './types';

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ??
  'popshelf-scraper/1.0 (+https://github.com/GLRose/popshelf; personal collection tool)';
const DEFAULT_TTL_MS = Number(process.env.SCRAPER_CACHE_TTL_MS ?? 24 * 60 * 60 * 1000);
const DOMAIN_CONCURRENCY = Number(process.env.SCRAPER_DOMAIN_CONCURRENCY ?? 2);
const MIN_DELAY_MS = Number(process.env.SCRAPER_DOMAIN_DELAY_MS ?? 500);
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms * (0.5 + Math.random());

function domainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface DomainState {
  active: number;
  waiters: (() => void)[];
  nextAllowedAt: number;
  pausedUntil: number;
}

/** Per-domain scheduler: concurrency cap + min delay + cooldown. */
class RateLimiter {
  private readonly domains = new Map<string, DomainState>();
  constructor(private readonly log: Logger) {}

  private state(domain: string): DomainState {
    let s = this.domains.get(domain);
    if (!s) {
      s = { active: 0, waiters: [], nextAllowedAt: 0, pausedUntil: 0 };
      this.domains.set(domain, s);
    }
    return s;
  }

  /** Pause all further requests to a domain for `ms` (backoff overflow / 429). */
  pause(domain: string, ms: number): void {
    const s = this.state(domain);
    const until = Date.now() + ms;
    if (until > s.pausedUntil) {
      s.pausedUntil = until;
      this.log.warn(`pausing ${domain} for ${Math.round(ms / 1000)}s`);
    }
  }

  async run<T>(domain: string, fn: () => Promise<T>): Promise<T> {
    const s = this.state(domain);
    if (s.active >= DOMAIN_CONCURRENCY) {
      await new Promise<void>((r) => s.waiters.push(r));
    }
    s.active++;
    try {
      const wait = Math.max(s.pausedUntil - Date.now(), s.nextAllowedAt - Date.now(), 0);
      if (wait > 0) await sleep(wait);
      s.nextAllowedAt = Date.now() + jitter(MIN_DELAY_MS);
      return await fn();
    } finally {
      s.active--;
      s.waiters.shift()?.();
    }
  }
}

interface CacheEntry {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
  readonly storedAt: number;
}

async function readCache(key: string, ttl: number): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(resolve(CACHE_DIR, `${key}.json`), 'utf8');
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.storedAt > ttl) return null;
    return entry;
  } catch {
    return null;
  }
}

async function writeCache(key: string, entry: CacheEntry): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(resolve(CACHE_DIR, `${key}.json`), JSON.stringify(entry), 'utf8');
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface FetcherStats {
  requests: number;
  cacheHits: number;
}

export function createFetcher(log: Logger, stats: FetcherStats): Fetcher {
  const limiter = new RateLimiter(log);

  async function fetchText(url: string, opts: FetchOptions | undefined): Promise<CacheEntry> {
    const ttl = opts?.cacheTtlMs === false ? 0 : (opts?.cacheTtlMs ?? DEFAULT_TTL_MS);
    const key = shortHash(`GET ${url}`);
    if (ttl > 0) {
      const cached = await readCache(key, ttl);
      if (cached) {
        stats.cacheHits++;
        log.debug(`cache hit ${url}`);
        return cached;
      }
    }
    const domain = domainOf(url);
    const headers = { 'User-Agent': USER_AGENT, ...opts?.headers };

    for (let attempt = 0; ; attempt++) {
      const entry = await limiter.run(domain, async () => {
        stats.requests++;
        const res = await fetch(url, { headers });
        const body = await res.text();
        return {
          url,
          status: res.status,
          contentType: res.headers.get('content-type') ?? '',
          body,
          storedAt: Date.now(),
          retryAfter: Number(res.headers.get('retry-after')) || 0,
        };
      });

      if (entry.status >= 200 && entry.status < 300) {
        if (ttl > 0) await writeCache(key, entry);
        return entry;
      }

      const retryable = RETRYABLE.has(entry.status) || entry.status === 403;
      if (!retryable || attempt >= MAX_RETRIES) {
        throw new Error(`GET ${url} -> HTTP ${entry.status}`);
      }
      const backoff = entry.retryAfter > 0 ? entry.retryAfter * 1000 : jitter(2 ** attempt * 1000);
      // A domain that keeps refusing gets paused so the rest of the run keeps moving.
      if (attempt >= 2) limiter.pause(domain, backoff);
      log.warn(`GET ${url} -> HTTP ${entry.status}; retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(backoff)}ms`);
      await sleep(backoff);
    }
  }

  return {
    async text(url, opts) {
      return (await fetchText(url, opts)).body;
    },
    async json(url, opts) {
      const entry = await fetchText(url, opts);
      return JSON.parse(entry.body) as unknown;
    },
    async binary(url, opts) {
      const domain = domainOf(url);
      const headers = { 'User-Agent': USER_AGENT, ...opts?.headers };
      return limiter.run(domain, async () => {
        stats.requests++;
        const res = await fetch(url, { headers });
        if (!(res.status >= 200 && res.status < 300)) {
          throw new Error(`GET ${url} -> HTTP ${res.status}`);
        }
        return Buffer.from(await res.arrayBuffer());
      });
    },
  };
}
