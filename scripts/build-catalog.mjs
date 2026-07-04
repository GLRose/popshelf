// Builds the REAL catalog by scraping collector databases:
//   Skullpanda -> skullpandaworld.com (clean white-bg renders, names in filenames)
//   Peach Riot -> thetoypool.com     (per-figure photos, names in filenames)
// Writes src/data/figures.json (catalog) + scripts/sources.json (id -> image URL).
// Run: node scripts/build-catalog.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const titleize = (s) => s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

const ACCENTS = [
  '#8A7BF0', '#6C7BD1', '#C77D5A', '#6FB2A0', '#556070', '#8E9AAE', '#5E7CE2',
  '#C6415A', '#3D4C7A', '#7A5C8E', '#7F9B6E', '#D98AA6', '#C98A3E', '#5B8D88',
  '#B5687F', '#4E7A9B', '#9B6AB0', '#A8743E', '#6E8F5A',
];

// --- Skullpanda: skullpandaworld.com -------------------------------------
// Core blind-box figure series (accessories/magnets/pendants excluded).
const SKULLPANDA_SETS = [
  ['warmth-series', 'The Warmth'],
  ['everyday-wonderland-series', 'Everyday Wonderland'],
  ['the-ink-plum-blossom-series', 'The Ink Plum Blossom'],
  ['image-of-reality-series', 'Image of Reality'],
  ['the-sound-series', 'The Sound'],
  ['tell-me-what-you-want-series', 'Tell Me What You Want'],
  ['city-of-night-series', 'City of Night'],
  ['ancient-castle-series', 'Ancient Castle'],
  ['the-mare-of-animals-series', 'The Mare of Animals'],
  ['the-pardaox-series', 'The Paradox'],
  ['the-mirage-series', 'The Mirage'],
  ['limpressionnisme-series', "L'Impressionnisme"],
  ['winter-symphony-series', 'Winter Symphony'],
  ['laid-back-tomorrow-series', 'Laid Back Tomorrow'],
  ['the-addams-family-series', 'The Addams Family'],
  ['candy-monster-town-series', 'Candy Monster Town'],
  ['action-cut-series', 'Action Cut'],
  ['hypepanda-series', 'HYPEPANDA'],
  ['you-found-me-series', 'You Found Me'],
];

const NON_FIGURE = /-Cover|favicon|Background|Banner|-bg|-Box|-Package|-Display|-Lineup|-Set-|-Group|-All-/i;

function canon(u) {
  return u.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '');
}

async function scrapeSkullpanda(setSlug, label) {
  const res = await fetch(`https://skullpandaworld.com/series/${setSlug}/`, { headers: UA });
  if (!res.ok) return [];
  const html = await res.text();
  const all = [
    ...html.matchAll(
      /https:\/\/skullpandaworld\.com\/wp-content\/uploads\/[^"'()\\ ]+\.(?:jpg|jpeg|png|webp)/gi,
    ),
  ].map((m) => m[0]);
  const cover = all.find((u) => /-Cover\./i.test(u));
  const token = cover?.match(/SkullPandaWorld-(?:Regular|Secret)-(.*?)-Cover/i)?.[1] ?? null;

  const byName = new Map();
  for (const u of all) {
    if (NON_FIGURE.test(u)) continue;
    const m = u.match(/SkullPandaWorld-(Regular|Secret)-(.*?)\.(?:jpg|jpeg|png|webp)/i);
    if (!m) continue;
    let rest = m[2];
    let name = token && rest.startsWith(token + '-') ? rest.slice(token.length + 1) : rest;
    name = name.replace(/-\d+x\d+$/, '');
    if (!name || /^\d+x\d+$/.test(name)) continue;
    if (!byName.has(name)) byName.set(name, { rarity: m[1].toLowerCase(), url: canon(u) });
  }
  return [...byName.entries()].map(([name, v]) => ({
    name: titleize(name),
    rarity: v.rarity,
    url: v.url,
  }));
}

// --- Peach Riot: thetoypool.com ------------------------------------------
const PEACHRIOT_SETS = [
  ['rise-up-series', 'Rise Up', 'Rise-Up-Series-Peach-Riot-Series-Pop-Mart-Figure'],
  ['punk-fairy-series', 'Punk Fairy', 'Punk-Fairy-Series-Peach-Riot-Series-Pop-Mart-Figure'],
];

async function scrapePeachRiot(setSlug, label, tail) {
  const res = await fetch(`https://thetoypool.com/pop-mart/series/peach-riot/${setSlug}/`, {
    headers: UA,
  });
  if (!res.ok) return [];
  const html = await res.text();
  // Prefer largest render (s1600); collapse size variants to one per figure.
  const re = new RegExp(
    `https://[^"'()\\\\ ]+/s1600/([^"'/]+?)-${tail}-\\d+\\.(?:jpg|jpeg|png|webp)`,
    'gi',
  );
  const byName = new Map();
  for (const m of html.matchAll(re)) {
    const name = titleize(decodeURIComponent(m[1]));
    if (!name || /banner|background|button|logo/i.test(name)) continue;
    if (!byName.has(name)) byName.set(name, m[0]);
  }
  return [...byName.entries()].map(([name, url]) => ({ name, rarity: 'regular', url }));
}

// --- Build ----------------------------------------------------------------
const figures = [];
const sources = {};
let accentIdx = 0;

async function addSeries(series, setSlug, label, items) {
  const color = ACCENTS[accentIdx++ % ACCENTS.length];
  const setSlugClean = slug(label);
  const seen = new Set();
  let n = 0;
  for (const it of items) {
    let base = `${series}-${setSlugClean}-${slug(it.name)}`;
    let id = base;
    while (seen.has(id)) id = `${base}-${++n}`;
    seen.add(id);
    figures.push({ id, series, set: label, name: it.name, rarity: it.rarity, color });
    sources[id] = it.url;
  }
  console.log(`  ${label}: ${items.length} figures`);
}

console.log('Skullpanda (skullpandaworld.com):');
for (const [setSlug, label] of SKULLPANDA_SETS) {
  try {
    const items = await scrapeSkullpanda(setSlug, label);
    if (items.length) await addSeries('skullpanda', setSlug, label, items);
    else console.log(`  ${label}: 0 (skipped)`);
  } catch (e) {
    console.warn(`  ${label}: ERROR ${e.message}`);
  }
}

console.log('Peach Riot (thetoypool.com):');
for (const [setSlug, label, tail] of PEACHRIOT_SETS) {
  try {
    const items = await scrapePeachRiot(setSlug, label, tail);
    if (items.length) await addSeries('peachriot', setSlug, label, items);
    else console.log(`  ${label}: 0 (skipped)`);
  } catch (e) {
    console.warn(`  ${label}: ERROR ${e.message}`);
  }
}

writeFileSync(resolve(__dirname, '../src/data/figures.json'), JSON.stringify(figures, null, 2) + '\n');
writeFileSync(
  resolve(__dirname, 'sources.json'),
  JSON.stringify({ _comment: 'Generated by build-catalog.mjs', figures: sources }, null, 2) + '\n',
);

const sk = figures.filter((f) => f.series === 'skullpanda').length;
const pr = figures.filter((f) => f.series === 'peachriot').length;
console.log(`\nTotal ${figures.length} figures (skullpanda ${sk}, peachriot ${pr}).`);
console.log('Next: npm run images  (scrape -> cutout -> imagemap)');
