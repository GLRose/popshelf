import type { Logger } from './types';

// Console logger with a debug level gated by SCRAPER_DEBUG, so routine runs
// stay concise (the spec asks for concise progress logging) while a debug run
// can show cache hits, per-item decisions, etc.
export function createLogger(): Logger {
  const debugOn = process.env.SCRAPER_DEBUG === '1' || process.env.SCRAPER_DEBUG === 'true';
  return {
    info: (msg) => console.log(msg),
    warn: (msg) => console.warn(`WARN  ${msg}`),
    error: (msg) => console.error(`ERROR ${msg}`),
    debug: (msg) => {
      if (debugOn) console.log(`debug ${msg}`);
    },
  };
}
