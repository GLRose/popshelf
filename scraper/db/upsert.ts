// The idempotent write layer. One writer per IP holds the whole catalog and
// this IP's state in memory; each source drives it through a per-source facade
// (SourceWriter). Sharing one writer across sources is what lets sources run
// concurrently without racing on the single figures.json.
//
// Upsert identity is (source, sourceProductId): the same source product always
// maps back to the same catalog id, so re-runs never duplicate a row.
import { contentHashOf } from '../normalize/normalize';
import { slug } from '../core/text';
import type { KnownItem, NormalizedFigure } from '../core/types';
import {
  loadCatalog,
  loadState,
  saveCatalog,
  saveState,
  type SourceState,
  type StateFile,
  type StoredFigure,
} from './store';

export type UpsertAction = 'inserted' | 'updated' | 'skipped';

function toStored(f: NormalizedFigure): StoredFigure {
  const stored: StoredFigure = {
    id: f.id,
    series: f.series,
    set: f.set,
    name: f.name,
    rarity: f.rarity,
    color: f.color,
  };
  if (f.year !== undefined) stored.year = f.year;
  return stored;
}

/** The natural identity of a catalog row: exactly what normalize.ts computes as
 * its baseId. Two rows that agree on this are the same physical figure, however
 * they got into the catalog. */
function identityOf(f: StoredFigure): string {
  return `${f.series}-${slug(f.set)}-${slug(f.name)}`;
}

/** Every way `rows` violates catalog uniqueness, described for a human. Empty
 * means the catalog is sound. Shared by the pre-write guard in `commit()` and
 * by the integrity test over the committed figures.json, so there is exactly
 * one definition of what "duplicate" means. */
export function findCatalogDuplicates(rows: readonly StoredFigure[]): string[] {
  const seenIds = new Map<string, StoredFigure>();
  const seenIdentities = new Map<string, StoredFigure>();
  const problems: string[] = [];

  for (const f of rows) {
    const clash = seenIds.get(f.id);
    if (clash) {
      problems.push(`duplicate id "${f.id}": ${clash.set}/${clash.name} and ${f.set}/${f.name}`);
    } else {
      seenIds.set(f.id, f);
    }

    const identity = identityOf(f);
    const twin = seenIdentities.get(identity);
    if (twin) {
      problems.push(`duplicate figure "${identity}" held by ids "${twin.id}" and "${f.id}"`);
    } else {
      seenIdentities.set(identity, f);
    }
  }
  return problems;
}

function sameStored(a: StoredFigure, b: StoredFigure): boolean {
  return (
    a.series === b.series &&
    a.set === b.set &&
    a.name === b.name &&
    a.rarity === b.rarity &&
    a.color === b.color &&
    a.year === b.year
  );
}

/** The surface one source drives. All catalog/state mutation for that source
 * goes through here; the underlying CatalogWriter is shared across sources. */
export interface SourceWriter {
  readonly known: ReadonlyMap<string, KnownItem>;
  resolveId(baseId: string, sourceProductId: string): string;
  apply(figure: NormalizedFigure): UpsertAction;
  setImageHash(sourceProductId: string, imageHash: string): void;
  priorImageHash(sourceProductId: string): string | undefined;
}

export class CatalogWriter {
  private catalog: StoredFigure[] = [];
  private readonly byId = new Map<string, StoredFigure>();
  private state: StateFile;
  /** ids handed out this run but whose rows may not be in `byId` yet, so two
   * items that slug to the same base id in one run don't collide. */
  private readonly reserved = new Set<string>();

  constructor(private readonly ip: string) {
    this.state = { ip, sources: {} };
  }

  async load(): Promise<void> {
    this.catalog = await loadCatalog();
    for (const f of this.catalog) this.byId.set(f.id, f);
    this.state = await loadState(this.ip);
  }

  private sourceState(source: string): SourceState {
    let s = this.state.sources[source];
    if (!s) {
      s = { lastRunAt: null, items: {} };
      this.state.sources[source] = s;
    }
    return s;
  }

  /** Prior state for a source, as the read-only map adapters receive. */
  knownFor(source: string): ReadonlyMap<string, KnownItem> {
    return new Map(Object.entries(this.sourceState(source).items));
  }

  private resolveId(source: string, baseId: string, sourceProductId: string): string {
    const prior = this.sourceState(source).items[sourceProductId];
    if (prior) return prior.figureId; // same product ⇒ same id, always.

    // First run against a catalog that was already seeded by hand: the row
    // sitting on baseId is this same figure, so take it over rather than fork a
    // twin beside it. Without this every pre-existing row becomes a duplicate
    // the moment its IP is scraped, which is exactly what happened to hirono.
    // Only a squatter whose own identity differs is a genuine collision.
    const squatter = this.byId.get(baseId);
    if (squatter && identityOf(squatter) === baseId && !this.reserved.has(baseId)) {
      this.reserved.add(baseId);
      return baseId;
    }

    let id = baseId;
    let n = 1;
    while (this.byId.has(id) || this.reserved.has(id)) id = `${baseId}-${++n}`;
    this.reserved.add(id);
    return id;
  }

  private apply(source: string, figure: NormalizedFigure): UpsertAction {
    const stored = toStored(figure);
    const existing = this.byId.get(figure.id);
    const src = this.sourceState(source);
    const prior = src.items[figure.provenance.sourceProductId];

    let action: UpsertAction;
    if (!existing) {
      this.catalog.push(stored);
      this.byId.set(stored.id, stored);
      action = 'inserted';
    } else if (sameStored(existing, stored)) {
      action = 'skipped';
    } else {
      Object.assign(existing, stored);
      action = 'updated';
    }

    src.items[figure.provenance.sourceProductId] = {
      figureId: figure.id,
      sourceUrl: figure.provenance.sourceUrl,
      scrapedAt: figure.provenance.scrapedAt,
      contentHash: contentHashOf(figure),
      imageUrl: figure.imageUrl,
      imageHash: prior?.imageHash,
    };
    return action;
  }

  /** A facade bound to one source; hands the pipeline exactly what it needs. */
  forSource(source: string): SourceWriter {
    return {
      known: this.knownFor(source),
      resolveId: (baseId, spid) => this.resolveId(source, baseId, spid),
      apply: (figure) => this.apply(source, figure),
      setImageHash: (spid, hash) => {
        const item = this.sourceState(source).items[spid];
        if (item) this.sourceState(source).items[spid] = { ...item, imageHash: hash };
      },
      priorImageHash: (spid) => this.sourceState(source).items[spid]?.imageHash,
    };
  }

  markRun(source: string): void {
    this.sourceState(source).lastRunAt = new Date().toISOString();
  }

  async commit(): Promise<void> {
    // Duplicate rows are a corruption of the catalog, not a warning: the app
    // builds FIGURES_BY_ID with last-write-wins and users shelve figures by id,
    // so a twin is invisible in code and very visible in the UI. Refuse to
    // write rather than persist one. Nothing is saved on throw, so the run is
    // safe to re-run once the cause is fixed.
    const problems = findCatalogDuplicates(this.catalog);
    if (problems.length > 0) {
      throw new Error(`refusing to write a catalog with duplicates:\n  ${problems.join('\n  ')}`);
    }
    await saveCatalog(this.catalog);
    await saveState(this.state);
  }
}
