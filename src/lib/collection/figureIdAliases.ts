// Figure ids that have been retired, mapped to the id that replaced them.
//
// In July 2026 the hirono section of the catalog held 68 duplicated figures:
// the scraper's first run over an IP that had already been curated by hand
// could not tell that the row sitting on its computed id WAS the figure it was
// about to write, so it forked a '-2' twin beside each one. The twins were
// merged back into the hand-curated ids; scraper/db/upsert.ts now adopts the
// existing row instead, so this map should never need another entry.
//
// Shelves and favourites store bare figure ids with no referential integrity
// anywhere, and the app silently drops an id it cannot resolve, so anything
// saved under a retired id has to be repointed rather than left to rot. Used
// by the v3 -> v4 migration in localCollection.ts.
export const RENAMED_FIGURE_IDS: Readonly<Record<string, string>> = {
  'hirono-echo-back-off-2': 'hirono-echo-back-off',
  'hirono-echo-breakout-plan-2': 'hirono-echo-breakout-plan',
  'hirono-echo-caught-you-2': 'hirono-echo-caught-you',
  'hirono-echo-daydreaming-2': 'hirono-echo-daydreaming',
  'hirono-echo-eaten-2': 'hirono-echo-eaten',
  'hirono-echo-get-lucky-2': 'hirono-echo-get-lucky',
  'hirono-echo-hiding-behind-you-2': 'hirono-echo-hiding-behind-you',
  'hirono-echo-journey-in-the-rain-2': 'hirono-echo-journey-in-the-rain',
  'hirono-echo-knight-2': 'hirono-echo-knight',
  'hirono-echo-never-growing-up-2': 'hirono-echo-never-growing-up',
  'hirono-echo-pieces-of-memory-2': 'hirono-echo-pieces-of-memory',
  'hirono-echo-soul-connection-2': 'hirono-echo-soul-connection',
  'hirono-echo-staying-up-2': 'hirono-echo-staying-up',
  'hirono-mime-blind-2': 'hirono-mime-blind',
  'hirono-mime-destroy-2': 'hirono-mime-destroy',
  'hirono-mime-devilry-2': 'hirono-mime-devilry',
  'hirono-mime-drifter-2': 'hirono-mime-drifter',
  'hirono-mime-fool-2': 'hirono-mime-fool',
  'hirono-mime-guardian-2': 'hirono-mime-guardian',
  'hirono-mime-patience-2': 'hirono-mime-patience',
  'hirono-mime-poem-2': 'hirono-mime-poem',
  'hirono-mime-prison-2': 'hirono-mime-prison',
  'hirono-mime-secrecy-2': 'hirono-mime-secrecy',
  'hirono-mime-seeker-2': 'hirono-mime-seeker',
  'hirono-mime-silent-2': 'hirono-mime-silent',
  'hirono-mime-unspoken-2': 'hirono-mime-unspoken',
  'hirono-monsters-carnival-creepy-clown-2': 'hirono-monsters-carnival-creepy-clown',
  'hirono-monsters-carnival-doctor-beak-2': 'hirono-monsters-carnival-doctor-beak',
  'hirono-monsters-carnival-grim-reaper-2': 'hirono-monsters-carnival-grim-reaper',
  'hirono-monsters-carnival-killer-bunny-2': 'hirono-monsters-carnival-killer-bunny',
  'hirono-monsters-carnival-the-disembodied-2': 'hirono-monsters-carnival-the-disembodied',
  'hirono-monsters-carnival-vampire-2': 'hirono-monsters-carnival-vampire',
  'hirono-monsters-carnival-zombie-2': 'hirono-monsters-carnival-zombie',
  'hirono-reshape-burst-2': 'hirono-reshape-burst',
  'hirono-reshape-costume-2': 'hirono-reshape-costume',
  'hirono-reshape-drowning-2': 'hirono-reshape-drowning',
  'hirono-reshape-fading-2': 'hirono-reshape-fading',
  'hirono-reshape-healing-2': 'hirono-reshape-healing',
  'hirono-reshape-paradise-lost-2': 'hirono-reshape-paradise-lost',
  'hirono-reshape-parasite-2': 'hirono-reshape-parasite',
  'hirono-reshape-puppet-2': 'hirono-reshape-puppet',
  'hirono-reshape-voyage-2': 'hirono-reshape-voyage',
  'hirono-reshape-woodcarving-2': 'hirono-reshape-woodcarving',
  'hirono-shelter-alien-2': 'hirono-shelter-alien',
  'hirono-shelter-birdy-2': 'hirono-shelter-birdy',
  'hirono-shelter-cabin-2': 'hirono-shelter-cabin',
  'hirono-shelter-candleholder-2': 'hirono-shelter-candleholder',
  'hirono-shelter-circus-2': 'hirono-shelter-circus',
  'hirono-shelter-fort-2': 'hirono-shelter-fort',
  'hirono-shelter-mantel-clock-2': 'hirono-shelter-mantel-clock',
  'hirono-shelter-poet-2': 'hirono-shelter-poet',
  'hirono-shelter-stuffed-bear-2': 'hirono-shelter-stuffed-bear',
  'hirono-shelter-sunny-doll-2': 'hirono-shelter-sunny-doll',
  'hirono-shelter-traffic-cone-2': 'hirono-shelter-traffic-cone',
  'hirono-shelter-warrior-2': 'hirono-shelter-warrior',
  'hirono-tamed-wildgrass-boiling-frog-2': 'hirono-tamed-wildgrass-boiling-frog',
  'hirono-tamed-wildgrass-boundary-2': 'hirono-tamed-wildgrass-boundary',
  'hirono-tamed-wildgrass-caged-bird-2': 'hirono-tamed-wildgrass-caged-bird',
  'hirono-tamed-wildgrass-camping-2': 'hirono-tamed-wildgrass-camping',
  'hirono-tamed-wildgrass-canned-dreams-2': 'hirono-tamed-wildgrass-canned-dreams',
  'hirono-tamed-wildgrass-city-escape-2': 'hirono-tamed-wildgrass-city-escape',
  'hirono-tamed-wildgrass-digital-bind-2': 'hirono-tamed-wildgrass-digital-bind',
  'hirono-tamed-wildgrass-fated-2': 'hirono-tamed-wildgrass-fated',
  'hirono-tamed-wildgrass-full-time-2': 'hirono-tamed-wildgrass-full-time',
  'hirono-tamed-wildgrass-live-under-receipts-2': 'hirono-tamed-wildgrass-live-under-receipts',
  'hirono-tamed-wildgrass-overload-2': 'hirono-tamed-wildgrass-overload',
  'hirono-tamed-wildgrass-self-anchored-2': 'hirono-tamed-wildgrass-self-anchored',
  'hirono-tamed-wildgrass-sisyphean-work-2': 'hirono-tamed-wildgrass-sisyphean-work',
};

/** Resolve a possibly-retired figure id to the one the catalog still holds. */
export function currentFigureId(id: string): string {
  return RENAMED_FIGURE_IDS[id] ?? id;
}

/** Repoint every retired id in `ids`, dropping the duplicates a remap creates
 * when both the retired id and its replacement were saved. */
export function remapFigureIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.map(currentFigureId)));
}
