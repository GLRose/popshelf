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
  ['lil-peach-riot,-loading!-series', 'Lil Peach Riot Loading', 'Lil-Peach-Riot-Loading-Series-Pop-Mart-Figure'],
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

// --- Peach Riot: manual data ---------------------------------------------
// Series that no clean image source exposes for automated scraping (Pop Mart's
// own API requires signed requests; retail/fan sites have no per-figure renders).
// We record the catalog data now so the app is complete; each figure shows the
// styled placeholder until an official render is dropped into assets/figures/raw/
// keyed by the figure id and scripts/scrape.mjs -> cutout -> imagemap is re-run.
// Rosters compiled 2026-07-06 from Pop Mart product listings + collector guides.
const MANUAL_PEACHRIOT = [
  ['Rush Hour', [
    ['Gigi Diner', 'regular'], ['Frankie Barista', 'regular'],
    ['Poppy Ice Cream Parlor', 'regular'], ['Gigi Housekeeping', 'regular'],
    ['Frankie Autoshop', 'regular'], ['Poppy Scientist', 'regular'],
    ['Gigi Mail Delivery', 'regular'], ['Frankie Tutor', 'regular'],
    ['Poppy Receptionist', 'regular'], ['Gigi Cat Walker', 'regular'],
    ['Frankie Camp Counselor', 'regular'], ['Poppy Life Guard', 'regular'],
    ['Frankie Streamer', 'secret'],
  ]],
  ['Power Chords', [
    ['Poppy The Sea', 'regular'], ['Gigi The Hunt', 'regular'],
    ['Frankie The Strategist', 'regular'], ['Poppy The Beauty', 'regular'],
    ['Frankie The Harvest', 'regular'], ['Gigi The Celebration', 'regular'],
    ['Poppy The Guardian', 'regular'], ['Gigi The Anthem', 'regular'],
    ['Frankie The Thunder', 'regular'], ['Poppy The Poet', 'regular'],
    ['Gigi The Messenger', 'regular'], ['Frankie The Forger', 'regular'],
    ['Gigi The Underworld', 'secret'],
  ]],
  ['Lil Peach Riot Sleepover', [
    ['Gigi Brush Teeth', 'regular'], ['Poppy Yawn', 'regular'],
    ['Frankie Night Tea', 'regular'], ['Gigi Prank Call', 'regular'],
    ['Poppy Face Mask', 'regular'], ['Frankie Pillow Fight', 'regular'],
    ['Gigi Star', 'regular'], ['Poppy Cloud', 'regular'],
    ['Frankie Moon', 'regular'], ['Gigi Alarm', 'regular'],
    ['Poppy Breakfast', 'regular'], ['Frankie Morning Coffee', 'regular'],
    ['Poppy Dream', 'secret'],
  ]],
  ['Witchy Punk', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
  ['À La Mode', [
    ['Gigi Mint Chocolate', 'regular'], ['Frankie Truffle', 'regular'],
    ['Poppy Banana Pudding', 'regular'],
  ]],
  ['Winter Break OOTD', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
  ['Western Riot', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
  ['Off-Duty: New York City', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
  ['Lil Holiday Mixtape', [
    ['Frankie It\'s Snowing', 'regular'], ['Gigi All is Calm', 'regular'],
    ['Poppy Check Off My Holiday List', 'regular'], ['Poppy Angry Bells', 'regular'],
    ['Frankie I Gave You My Heart', 'regular'], ['Gigi Rock the Night Away', 'regular'],
    ['Frankie Make My Wish Come True', 'secret'],
  ]],
  ['Carry The Music', [
    ['Frankie Jam Sesh', 'regular'], ['Frankie Day Off', 'regular'],
    ['Gigi In The Studio', 'regular'], ['Gigi After Hours', 'regular'],
    ['Poppy Producer', 'regular'], ['Poppy Cozy Nook', 'regular'],
    ['Poppy Chill Weekend', 'secret'],
  ]],
  ['Street Style', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
  ['Bloody Valentine', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
  ['Angel', [
    ['Frankie Virtues', 'regular'], ['Gigi Dark Angel', 'regular'], ['Poppy Seraphim', 'regular'],
  ]],
  ['Siren\'s Song', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
  ['Rainbow Riot', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
  ['Fruit Punch (Pendant\'s)', [
    ['Frankie', 'regular'], ['Gigi', 'regular'], ['Poppy', 'regular'],
  ]],
];

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
    // Manual/data-only figures have no image yet; the UI shows a placeholder
    // until a render is dropped in and scripts/scrape.mjs is re-run.
    if (it.url) sources[id] = it.url;
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

console.log('Peach Riot (manual - data only, images pending):');
for (const [label, rows] of MANUAL_PEACHRIOT) {
  const items = rows.map(([name, rarity]) => ({ name, rarity, url: null }));
  await addSeries('peachriot', slug(label), label, items);
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
