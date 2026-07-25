import { SERIES } from '@/constants/palette';
import { FIGURES } from '@/data/figures';
import type { Figure } from '@/types';

/**
 * Catalog search.
 *
 * One box has to reach a figure by any of the three names a collector actually
 * knows it by - the IP, the set, or the figure itself - because they rarely
 * know which of the three the thing they typed is. "po" has to find Power
 * Chords and Poppy The Poet; "peach riot power" has to find the same set with
 * the tokens split across two different fields.
 *
 * So a query is matched token by token, each token against every field, and a
 * figure only survives if *every* token matched something. That is what keeps
 * adding words narrowing the result set instead of widening it, which is how
 * search boxes are expected to behave.
 */

/** How much a match in each field is worth, relative to the others. */
const FIELD_WEIGHT = {
  name: 3,
  set: 2.2,
  series: 1.5,
} as const;

/** How much the quality of the match itself is worth, before field weighting. */
const EXACT = 3;
const PREFIX = 2;
const SUBSTRING = 1;

/**
 * Below this length a token only matches at a word boundary. A single letter
 * appears somewhere inside most names in the catalog, so allowing it to match
 * mid-word would make one-character queries return nearly everything.
 */
const MIN_SUBSTRING_LENGTH = 2;

export interface SearchResult {
  figure: Figure;
  score: number;
  /** Whether the query reads as the name of this figure's set. */
  namesTheSet: boolean;
}

/**
 * How much a group gains from having matched *completely*. Typing "po" hits one
 * stray figure in a dozen sets and every figure in Power Chords, and the second
 * of those is what the user meant - the set name is the thing they were typing.
 * Coverage is what tells the two apart, since a set-name match is by definition
 * the only kind that matches all of a set at once.
 */
const COVERAGE_WEIGHT = 4;

/** A run of matching figures that share a set, in catalog order. */
export interface SearchGroup {
  series: Figure['series'];
  set: string;
  figures: Figure[];
  /** Rank: the group's best figure score, plus its coverage of the set. */
  score: number;
}

/**
 * Lowercase, strip diacritics, and reduce every run of punctuation to a single
 * space. Keeps "À La Mode" reachable by typing "a la mode" and
 * "Fruit Punch (Pendant's)" reachable by typing "pendants".
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(query: string): string[] {
  const normalized = normalize(query);
  if (normalized.length === 0) {
    return [];
  }
  return normalized.split(' ');
}

/** Scores one query token against one already-normalized field. */
function scoreField(token: string, field: string): number {
  const words = field.split(' ');
  if (words.includes(token)) {
    return EXACT;
  }
  if (words.some((word) => word.startsWith(token))) {
    return PREFIX;
  }
  if (token.length >= MIN_SUBSTRING_LENGTH && field.includes(token)) {
    return SUBSTRING;
  }
  return 0;
}

/**
 * The normalized fields of one figure, built once per catalog rather than once
 * per keystroke. The catalog is static, so this is module-level work.
 */
interface Indexed {
  figure: Figure;
  name: string;
  set: string;
  series: string;
}

/** Position of each figure in the catalog, for restoring set order cheaply. */
const CATALOG_ORDER = new Map<string, number>(FIGURES.map((figure, i) => [figure.id, i]));

const setKey = (figure: Figure): string => `${figure.series}/${figure.set}`;

/** How many figures each set holds, which is the denominator of coverage. */
const SET_SIZE = FIGURES.reduce((sizes, figure) => {
  const key = setKey(figure);
  sizes.set(key, (sizes.get(key) ?? 0) + 1);
  return sizes;
}, new Map<string, number>());

const INDEX: Indexed[] = FIGURES.map((figure) => ({
  figure,
  name: normalize(figure.name),
  set: normalize(figure.set),
  // Both the display label ("PEACH RIOT") and the slug ("peachriot"), so the
  // IP is reachable whether or not the user puts a space in it.
  series: normalize(`${SERIES[figure.series]?.label ?? figure.series} ${figure.series}`),
}));

interface Scored {
  score: number;
  /**
   * Whether every token landed on the set name at a word boundary, i.e. the
   * user appears to be typing the set's own name. Only that earns the full
   * coverage bonus: a mid-word substring hit sweeps a whole set in too ("po"
   * is inside "Sleepover"), and it should not be mistaken for naming it.
   */
  namesTheSet: boolean;
}

function scoreEntry(entry: Indexed, tokens: string[]): Scored {
  let total = 0;
  let namesTheSet = true;
  for (const token of tokens) {
    const set = scoreField(token, entry.set);
    const best = Math.max(
      scoreField(token, entry.name) * FIELD_WEIGHT.name,
      set * FIELD_WEIGHT.set,
      scoreField(token, entry.series) * FIELD_WEIGHT.series,
    );
    // Every token has to land somewhere, or the figure is not a result.
    if (best === 0) {
      return { score: 0, namesTheSet: false };
    }
    if (set < PREFIX) {
      namesTheSet = false;
    }
    total += best;
  }
  return { score: total, namesTheSet };
}

/** Every figure matching the query, best first. Empty for an empty query. */
export function searchFigures(query: string): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];
  for (const entry of INDEX) {
    const { score, namesTheSet } = scoreEntry(entry, tokens);
    if (score > 0) {
      results.push({ figure: entry.figure, score, namesTheSet });
    }
  }

  // Sort is stable, so equal scores keep catalog order.
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Search results grouped into the sets they came from. Results are shown as
 * sets rather than as one long flat grid because a figure means very little
 * without the set it belongs to, and a set-name query is otherwise indis-
 * tinguishable from a dozen unrelated hits.
 */
export function searchGroups(query: string): SearchGroup[] {
  const groups = new Map<string, SearchGroup>();
  const named = new Set<string>();

  for (const { figure, score, namesTheSet } of searchFigures(query)) {
    const key = setKey(figure);
    if (namesTheSet) {
      named.add(key);
    }
    const existing = groups.get(key);
    if (existing) {
      existing.figures.push(figure);
      existing.score = Math.max(existing.score, score);
      continue;
    }
    groups.set(key, { series: figure.series, set: figure.set, figures: [figure], score });
  }

  const ordered = [...groups.values()];
  for (const group of ordered) {
    // Within a set, catalog order reads better than score order: it keeps the
    // set's own sequence intact and puts its secret where it belongs.
    group.figures.sort((a, b) => CATALOG_ORDER.get(a.id)! - CATALOG_ORDER.get(b.id)!);

    const key = setKey(group.figures[0]);
    const size = SET_SIZE.get(key) ?? group.figures.length;
    const coverage = group.figures.length / size;
    group.score += COVERAGE_WEIGHT * coverage * (named.has(key) ? 1 : 0.5);
  }
  return ordered.sort((a, b) => b.score - a.score);
}
