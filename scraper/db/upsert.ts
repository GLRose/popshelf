// The idempotent write layer. One writer per IP holds the whole catalog and
// this IP's state in memory; each source drives it through a per-source facade
// (SourceWriter). Sharing one writer across sources is what lets sources run
// concurrently without racing on the single figures.json.
//
// Upsert identity is (source, sourceProductId): the same source product always
// maps back to the same catalog id, so re-runs never duplicate a row.
import { contentHashOf } from '../normalize/normalize';
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
    await saveCatalog(this.catalog);
    await saveState(this.state);
  }
}
