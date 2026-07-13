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

const decodeEntities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const ACCENTS = [
  '#8A7BF0', '#6C7BD1', '#C77D5A', '#6FB2A0', '#556070', '#8E9AAE', '#5E7CE2',
  '#C6415A', '#3D4C7A', '#7A5C8E', '#7F9B6E', '#D98AA6', '#C98A3E', '#5B8D88',
  '#B5687F', '#4E7A9B', '#9B6AB0', '#A8743E', '#6E8F5A',
];

// --- Skullpanda: skullpandaworld.com -------------------------------------
// Core blind-box figure series (accessories/magnets/pendants excluded).
// Third column is the series name exactly as it appears in each figure's `alt`
// text, which is the field we read names from. It differs from our display
// label often enough (typos, punctuation, "!") that it has to be spelled out:
// "the-pardaox-series" is the site's own misspelling of The Paradox.
const SKULLPANDA_SETS = [
  ['warmth-series', 'The Warmth', 'Warmth Series'],
  ['everyday-wonderland-series', 'Everyday Wonderland', 'Everyday Wonderland Series'],
  ['the-ink-plum-blossom-series', 'The Ink Plum Blossom', 'The Ink Plum Blossom Series'],
  ['image-of-reality-series', 'Image of Reality', 'Image Of Reality Series'],
  ['the-sound-series', 'The Sound', 'The Sound Series'],
  ['tell-me-what-you-want-series', 'Tell Me What You Want', 'Tell Me What You Want Series'],
  ['city-of-night-series', 'City of Night', 'City of Night Series'],
  ['ancient-castle-series', 'Ancient Castle', 'Ancient Castle Series'],
  ['the-mare-of-animals-series', 'The Mare of Animals', 'The Mare of Animals Series'],
  ['the-pardaox-series', 'The Paradox', 'The Pardaox Series'],
  ['the-mirage-series', 'The Mirage', 'The Mirage Series'],
  ['limpressionnisme-series', "L'Impressionnisme", 'L’impressionnisme Series'],
  ['winter-symphony-series', 'Winter Symphony', 'Winter Symphony Series'],
  ['laid-back-tomorrow-series', 'Laid Back Tomorrow', 'Laid Back Tomorrow Series'],
  ['the-addams-family-series', 'The Addams Family', 'The Addams Family Series'],
  ['candy-monster-town-series', 'Candy Monster Town', 'Candy Monster Town Series'],
  ['action-cut-series', 'Action Cut', 'Action! Cut! Series'],
  ['hypepanda-series', 'HYPEPANDA', 'Hypepanda Series'],
  ['you-found-me-series', 'You Found Me', 'You Found Me! Series'],
];

function canon(u) {
  return u.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '');
}

// Names come from each grid image's `alt` ("SKULLPANDA <series> - <name>"), never its
// filename: only some series use the "SkullPandaWorld-Regular-<series>-<name>" convention,
// while the rest name files after the figure alone ("Out-of-the-Mud-2.jpg"). `alt` is
// uniform across every series and preserves real punctuation ("The Duality (White)").
async function scrapeSkullpanda(setSlug, altSeries) {
  const res = await fetch(`https://skullpandaworld.com/series/${setSlug}/`, { headers: UA });
  if (!res.ok) return [];
  const html = await res.text();

  // `product-grid-img` marks the per-figure renders, excluding covers, banners and
  // the cross-series links in the sidebar.
  const prefix = `SKULLPANDA ${altSeries} - `;
  const byName = new Map();
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/class="[^"]*\bproduct-grid-img\b/.test(tag)) continue;
    const src = tag.match(/\ssrc="([^"]+)"/)?.[1];
    const alt = tag.match(/\salt="([^"]*)"/)?.[1];
    if (!src || !alt) continue;
    const decoded = decodeEntities(alt);
    if (!decoded.startsWith(prefix)) continue;
    const name = decoded.slice(prefix.length).trim();
    if (!name) continue;
    // The site publishes every figure as "Regular"; secrets are kept back. Honour the
    // marker anyway so they get picked up if that ever changes.
    const rarity = /-Secret-/i.test(src) ? 'secret' : 'regular';
    if (!byName.has(name)) byName.set(name, { rarity, url: canon(src) });
  }
  return [...byName.entries()].map(([name, v]) => ({ name, rarity: v.rarity, url: v.url }));
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
// styled placeholder until an official render is dropped into catalog-images/raw/
// keyed by the figure id and scripts/scrape.mjs -> cutout -> upload:catalog is re-run.
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

// --- Skullpanda: manual data ----------------------------------------------
// Series/items skullpandaworld.com does not carry (too new, or never listed
// under /series/): the app needs the catalog data now, so each figure shows
// the styled placeholder until a render is dropped into catalog-images/raw/
// keyed by the figure id and scripts/scrape.mjs -> cutout -> upload:catalog is
// re-run. Rosters compiled 2026-07-11 from Pop Mart product listings +
// collector guides (popmart.com, arttoyfamilia.com, popcollectorworld.com).
const MANUAL_SKULLPANDA = [
  ['My Little Pony', [
    ['Twilight Sparkle', 'regular'], ['Rainbow Dash', 'regular'], ['Pinkie Pie', 'regular'],
    ['Fluttershy', 'regular'], ['Rarity', 'regular'], ['Applejack', 'regular'],
    ['Sunset Shimmer', 'secret'], ['Queen Chrysalis', 'secret'],
  ]],
  ['The Feast Begins', [
    ['The Dinner Knife', 'regular'], ['The Silver Fork', 'regular'], ['The Caddy Spoon', 'regular'],
    ['The Spoon Warmer', 'regular'], ['The Napkin', 'regular'], ['The Silver Claret Jug', 'regular'],
    ['The Sugar Tongs', 'regular'], ['The Crumb Scoop', 'regular'], ['The Aspic Server', 'regular'],
    ['The Knife Rest', 'regular'], ['The Egg Cup', 'regular'], ['The Grape Scissors', 'regular'],
    ['Fine Dining', 'secret'],
  ]],
  ['Petals in Four Acts', [
    ["The Fairy's Trick", 'regular'], ['The Budding Fable', 'regular'], ['The Invitation of Light', 'regular'],
    ['The Fatal Entwining', 'regular'], ['The Vow', 'regular'], ['The Burning Gloom', 'regular'],
    ['The Withered Innocence', 'regular'], ['The Submerged Wreath', 'regular'], ['The Elegiac Witness', 'regular'],
    ['The Decay Awaited', 'regular'], ['The Crown in Ashes', 'regular'], ['The Threefold Requiem', 'regular'],
    ["Chronos' Gardener", 'secret'],
  ]],
];

// --- Skullpanda: special editions ------------------------------------------
// One-off collectibles, not blind-box sets: each has a single per-product
// image on skullpandaworld.com (main `wp-post-image`, not a `product-grid-img`
// grid, so scraped by hand here rather than via scrapeSkullpanda). Entries
// below with a `null` image are region exclusives, resale-only, or otherwise
// never carried on skullpandaworld.com; no clean image source found, so they
// ship data-only until a render is added by hand.
// Additional rows (Van Gogh Museum Sunflowers/White Moon MEGA; Ducati/Guo Pei
// action figures; Celestial Horse through Breath of Veil special editions)
// compiled 2026-07-12 from popmart.com official product pages plus at least
// one independent secondary source each (arttoyfamilia.com, stockx.com,
// whoopea.com, ebay.com, or trade press such as licenseglobal.com/siliconera.com).
const SKULLPANDA_MEGA = [
  ['Between Light and Dark', 'https://skullpandaworld.com/wp-content/uploads/2025/06/MEGA-Between-Light-and-Dark.jpg'],
  ['CLOT', 'https://skullpandaworld.com/wp-content/uploads/2025/06/MEGA-CLOT.jpg'],
  ['Egon Schiele', 'https://skullpandaworld.com/wp-content/uploads/2025/05/MEGA-Egon-Schiele.jpg'],
  ['Entangled', 'https://skullpandaworld.com/wp-content/uploads/2025/06/MEGA-Entangled.jpg'],
  ['Jean-Michel Basquiat', 'https://skullpandaworld.com/wp-content/uploads/2025/05/MEGA-JEAN-MICHEL-BASQUIAT.jpg'],
  ['Mika Ninagawa', 'https://skullpandaworld.com/wp-content/uploads/2025/06/MEGA-MIKA-NINAGAWA.jpg'],
  ['Red Crystal', 'https://skullpandaworld.com/wp-content/uploads/2025/05/Red-Crystal.jpg'],
  ['Thaw', 'https://skullpandaworld.com/wp-content/uploads/2025/06/MEGA-Thaw.jpg'],
  // Released Aug 2025 (popmart.com/us/products/3082 + /3542, 400%/1000%); confirmed via
  // Amazon, Urban Outfitters, and POP MART Global's own announcement post.
  ['Van Gogh Museum Sunflowers', null],
  // Released Nov 27 2025 (popmart.com/us/products/4256); confirmed via eBay, StockX,
  // Urban Outfitters, and Whoopea.
  ['White Moon', null],
];
const SKULLPANDA_ACTION_FIGURE = [
  ['HAMCUS', 'https://skullpandaworld.com/wp-content/uploads/2025/05/HAMCUS-16-Action-Figure.jpg'],
  ['The Unknown', 'https://skullpandaworld.com/wp-content/uploads/2025/06/The-Unknown-16-Action-Figure.jpg'],
  ['White Dew', 'https://skullpandaworld.com/wp-content/uploads/2025/06/WHITE-DEW-Action-Figure.jpg'],
  ['Komatsu Nana', 'https://skullpandaworld.com/wp-content/uploads/2025/06/Komatsu-Nana-Action-Figure.jpg'],
  ['Osaki Nana', 'https://skullpandaworld.com/wp-content/uploads/2025/06/Osaki-Nana-Action-Figure.jpg'],
  // Released Nov 13-14 2025 (popmart.com/us/products/4259); confirmed via POP MART US's
  // own X/Twitter announcement, StockX, and Art Toy Familia.
  ['Ducati', null],
  // Confirmed via popmart.com/us/products/5963 and popmart.com/gb, POP MART US's own
  // Instagram post, StockX, eBay, and Whoopea.
  ['Guo Pei', null],
];
const SKULLPANDA_SPECIAL_EDITIONS = [
  ['Lazy Panda', 'https://skullpandaworld.com/wp-content/uploads/2025/09/Lazy-Panda.jpg'],
  ['XG', null],
  ['Punk Panda', null],
  // Lunar New Year (Year of the Horse) release, Jan 15 2026 (popmart.com/us/products/5665);
  // confirmed via StockX, Art Toy Familia, and Whoopea.
  ['Celestial Horse', null],
  // China-exclusive non-blind-box release, May 16 2024 (missed by the prior compile);
  // confirmed via StockX, Art Toy Familia, and CBR.com.
  ['Sailor Moon', null],
  // Sanrio crossover plush pendants, released Dec 25 2025 (popmart.com/us/products/5214
  // and /5215, sold separately, not blind-boxed); confirmed via Siliconera and The Pop Insider.
  ['Kuromi', null],
  ['My Melody', null],
  // Released Sept 2025; confirmed via Art Toy Familia, eBay, and Mercari.
  ['Crocs OOTD', null],
  // Uniqlo UT collab figurine, launched China Mar 2025 / global Apr 2025; confirmed via
  // Art Toy Familia, SNKRDUNK, and Uniqlo's own product pages.
  ['A Tulip Invitation', null],
  // Limited-run pair released Oct 18 2024 (199pc / 399pc runs); confirmed via
  // Art Toy Familia, eBay, and Instagram.
  ['Ripples of Echo', null],
  ['In Silence', null],
  // Confirmed via popmart.com/my/products/321 (Club Man), Mindzai and TOYSEZ (Shopaholic,
  // limited to 200 pcs), and eBay for both.
  ['Club Man', null],
  ['Shopaholic', null],
  // White Maid released Aug 25 2021 (popmart.com/us/products/141); Dark Maid is its
  // paired overseas-exclusive variant. Confirmed via eBay, ETTV, Trampt, and Extreme Kawaii.
  ['Dark Maid', null],
  ['White Maid', null],
  // Thailand region-exclusive plush, released Dec 5 2024; confirmed via StockX,
  // Whoopea, and Art Toy Familia.
  ['As You Wish', null],
  // Australia region-exclusive, 2025; confirmed via Pushas, Art Toy Familia, and TOYSEZ.
  ['Breath of Veil', null],
  // Europe-exclusive plush, released Feb 28 2025 (popmart.com/de/products/1734); confirmed
  // via POP MART Global's own announcement, StockX, Whoopea, and Pushas.
  ['6kHz', null],
  // Standalone ~10cm light-up figure, released Sept 25 2025 (popmart.com/us/products/3793);
  // distinct from the larger "White Moon" MEGA release above. Confirmed via popmart.com,
  // eBay, and StockX.
  ['Covenant of the White Moon', null],
  // Valentine's Day 2025 limited edition, ~3.94in (popmart.com/us/products/1929); confirmed
  // via popmart.com, Amazon, and StockX.
  ['Aisling', null],
];

// --- Hirono: manual data ---------------------------------------------------
// No dedicated collector-database site is scraped for Hirono yet (unlike
// skullpandaworld.com/thetoypool.com above), so every set ships data-only
// until a render source is picked and scripts/scrape.mjs grows a Hirono path.
// Roster compiled 2026-07-12 via the figure-researcher agent, cross-checked
// against hironoworld.com, arttoyfamilia.com, popmart.com product pages, and
// resale listings (stockx.com/ebay.com/mercari.com) - at least 2 sources per set.
const MANUAL_HIRONO = [
  ['The Other One', [
    ['Vagrancy', 'regular'], ['Cuckoo', 'regular'], ['The Ghost', 'regular'],
    ['Nowhere Safe', 'regular'], ['Raving', 'regular'], ['Being Alive', 'regular'],
    ['The Monster', 'regular'], ['Amnesia', 'regular'], ['The Crow', 'regular'],
    ['The Fox', 'regular'], ['Staring', 'regular'], ['Marionette', 'regular'],
    ['Dreaming', 'secret'],
  ]],
  ['Little Mischief', [
    ['Ragpicker', 'regular'], ['Destroyer', 'regular'], ['Robot', 'regular'],
    ['Boiling Frog', 'regular'], ['Float', 'regular'], ['The Aviator', 'regular'],
    ['Birdman', 'regular'], ['Loose Fish', 'regular'], ['Pretender', 'regular'],
    ['Persona', 'regular'], ['Manacle', 'regular'], ['Protector', 'regular'],
    ['Unknown Journey', 'secret'],
  ]],
  ['City of Mercy', [
    ['Fallen Angel', 'regular'], ['Comfortably Numb', 'regular'], ['Healer', 'regular'],
    ['Insight', 'regular'], ['The Other', 'regular'], ['Echo', 'regular'],
    ['Belonging', 'secret'],
  ]],
  ['Mime', [
    ['Guardian', 'regular'], ['Blind', 'regular'], ['Seeker', 'regular'],
    ['Devilry', 'regular'], ['Drifter', 'regular'], ['Fool', 'regular'],
    ['Patience', 'regular'], ['Unspoken', 'regular'], ['Prison', 'regular'],
    ['Destroy', 'regular'], ['Poem', 'regular'], ['Secrecy', 'regular'],
    ['Silent', 'secret'],
  ]],
  ['Reshape', [
    ['Burst', 'regular'], ['Woodcarving', 'regular'], ['Fading', 'regular'],
    ['Healing', 'regular'], ['Paradise Lost', 'regular'], ['Drowning', 'regular'],
    ['Costume', 'regular'], ['Parasite', 'regular'], ['Voyage', 'regular'],
    ['Puppet', 'secret'],
  ]],
  ['Shelter', [
    ['Candleholder', 'regular'], ['Mantel Clock', 'regular'], ['Poet', 'regular'],
    ['Traffic Cone', 'regular'], ['Fort', 'regular'], ['Circus', 'regular'],
    ['Cabin', 'regular'], ['Birdy', 'regular'], ['Alien', 'regular'],
    ['Warrior', 'regular'], ['Sunny Doll', 'regular'], ['Bird Cage', 'regular'],
    ['Stuffed Bear', 'secret'],
  ]],
  ['Hirono × Le Petit Prince', [
    ['The King', 'regular'], ['The Conceited Man', 'regular'], ['The Tippler', 'regular'],
    ['The Businessman', 'regular'], ['The Lamplighter', 'regular'], ['The Geographer', 'regular'],
    ['The Fox', 'regular'], ['The Rose', 'regular'], ['The Snake', 'regular'],
    ['The Little Prince', 'regular'], ['The Merchant', 'regular'], ['The Switchman', 'regular'],
    ['The Pilot', 'secret'], ['The Little Prince (Special Edition)', 'secret'],
  ]],
  ['Hirono × CLOT', [
    ['Yin-Yang', 'regular'], ['Kung Fu', 'regular'], ['Alienegra', 'regular'],
    ['Chinese', 'regular'], ['Terracotta Army', 'regular'], ['Silk Royale', 'regular'],
    ['Ning Ning', 'secret'],
  ]],
  ['Echo', [
    ['Get Lucky', 'regular'], ['Journey in the Rain', 'regular'], ['Back Off', 'regular'],
    ['Hiding Behind You', 'regular'], ['Staying Up', 'regular'], ['Caught You', 'regular'],
    ['Eaten', 'regular'], ['Knight', 'regular'], ['Soul Connection', 'regular'],
    ['Pieces of Memory', 'regular'], ['Breakout Plan', 'regular'], ['Daydreaming', 'regular'],
    ['Never Growing Up', 'secret'],
  ]],
  ['Tamed Wildgrass', [
    ['Sisyphean Work', 'regular'], ['Caged Bird', 'regular'], ['Full-time', 'regular'],
    ['Camping', 'regular'], ['Self-Anchored', 'regular'], ['Boiling Frog', 'regular'],
    ['City Escape', 'regular'], ['Fated', 'regular'], ['Digital Bind', 'regular'],
    ['Live Under Receipts', 'regular'], ['Overload', 'regular'], ['Canned Dreams', 'regular'],
    ['Boundary', 'secret'],
  ]],
  ['Monsters\' Carnival', [
    ['Grim Reaper', 'regular'], ['Killer Bunny', 'regular'], ['Doctor Beak', 'regular'],
    ['Vampire', 'regular'], ['Creepy Clown', 'regular'], ['Zombie', 'regular'],
    ['The Disembodied', 'secret'],
  ]],
  ['Mist-Walker', [
    ['The Soul Corroder', 'regular'], ['The Wingless Follower', 'regular'], ['The Backlit Messenger', 'regular'],
    ['The Unfallen Wing', 'regular'], ['The Gap-Glimmer Wanderer', 'regular'], ['The Primordial Grace', 'regular'],
    ['The Tempered Aegis', 'secret'],
  ]],
  ['Road Journal', [
    ['Into Fogwild', 'regular'], ['Lost In The Night', 'regular'], ['Frostfall Hour', 'regular'],
    ['Woven Woods', 'regular'], ['Grey Gravel', 'regular'], ['City Dust Afloat', 'regular'],
    ['Highway Imprint', 'secret'],
  ]],
  ['Listening; Saying; Seeing', [
    ['Listening', 'regular'], ['Saying', 'regular'], ['Seeing', 'regular'],
  ]],
  ['200%', [
    ['Little Prank', 'regular'], ['Simper', 'regular'], ['Merry Christmas Mr. Hirono', 'regular'],
    ['The UFO Chaser', 'regular'], ['Reshape', 'regular'], ['Keith Haring', 'regular'],
  ]],
  ['Special Editions', [
    ['Elephant in the Room', 'regular'], ['Merry Christmas Mr. Hirono', 'regular'], ['Little Prank', 'regular'],
    ['The Pianist', 'regular'], ['Search for Aliens', 'regular'], ['Orange Soda', 'regular'],
    ['Doll Panda', 'regular'], ['Coffee', 'regular'], ['Before the Snow Melts', 'regular'],
    ['Floating Market', 'regular'], ['Summer Time', 'regular'], ['The Fleeting Years', 'regular'],
  ]],
  ['Blister Series', [
    ['Wandering', 'regular'], ['Persona (Lang Solo Exhibition)', 'regular'], ['Elephant in the Room (Thailand Exhibition Limited)', 'regular'],
    ['Shanghai Monster', 'regular'], ['Halloween Special', 'regular'], ['Halloween Special (China Edition)', 'regular'],
    ['Banger', 'regular'], ['Stray Panda', 'regular'], ['Simper', 'regular'],
  ]],
  ['Plush & Pendants', [
    ['Hirono Bear', 'regular'], ['Little Hare', 'regular'], ['Living Wild - Fight For Joy', 'regular'],
    ['Back to Play - Bear', 'regular'], ['Back to Play - Dino', 'regular'],
  ]],
  ['Collaborations', [
    ['Hirono × Snoopy', 'regular'], ['Hirono × Keith Haring', 'regular'], ['Hirono × Vans', 'regular'],
    ['Hirono × Gary Baseman', 'regular'], ['Hirono × Chucky', 'regular'], ['Hirono × Dead Silence', 'regular'],
    ['Hirono × Stefanie Sun (Weather With You)', 'regular'], ['Hirono × Stefanie Sun (Aut Nihilo)', 'regular'], ['Hirono × Leah Dou (In the Air)', 'regular'],
    ['Hirono × Qoo (Blush with Qoo)', 'regular'], ['Hirono × Polar (Symbiosis)', 'regular'], ['Hirono × Kodak (Little Bear)', 'regular'],
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

// A set that scrapes to nothing means the source markup moved, not that the set is empty.
// Abort before writing rather than ship a catalog that is quietly missing a series.
const failures = [];

console.log('Skullpanda (skullpandaworld.com):');
for (const [setSlug, label, altSeries] of SKULLPANDA_SETS) {
  try {
    const items = await scrapeSkullpanda(setSlug, altSeries);
    if (items.length) await addSeries('skullpanda', setSlug, label, items);
    else failures.push(`skullpanda/${label}: scraped 0 figures`);
  } catch (e) {
    failures.push(`skullpanda/${label}: ${e.message}`);
  }
}

console.log('Peach Riot (thetoypool.com):');
for (const [setSlug, label, tail] of PEACHRIOT_SETS) {
  try {
    const items = await scrapePeachRiot(setSlug, label, tail);
    if (items.length) await addSeries('peachriot', setSlug, label, items);
    else failures.push(`peachriot/${label}: scraped 0 figures`);
  } catch (e) {
    failures.push(`peachriot/${label}: ${e.message}`);
  }
}

console.log('Peach Riot (manual - data only, images pending):');
for (const [label, rows] of MANUAL_PEACHRIOT) {
  const items = rows.map(([name, rarity]) => ({ name, rarity, url: null }));
  await addSeries('peachriot', slug(label), label, items);
}

// New sets must be appended here, after every existing addSeries() call above,
// so accentIdx keeps handing out the same colors to the sets already shipped -
// inserting earlier would reshuffle every figure's accent color on next run.
console.log('Skullpanda (manual - data only, images pending):');
for (const [label, rows] of MANUAL_SKULLPANDA) {
  const items = rows.map(([name, rarity]) => ({ name, rarity, url: null }));
  await addSeries('skullpanda', slug(label), label, items);
}

console.log('Skullpanda special editions (manual, single-item releases):');
await addSeries(
  'skullpanda',
  slug('MEGA'),
  'MEGA',
  SKULLPANDA_MEGA.map(([name, url]) => ({ name, rarity: 'regular', url })),
);
await addSeries(
  'skullpanda',
  slug('Action Figure'),
  'Action Figure',
  SKULLPANDA_ACTION_FIGURE.map(([name, url]) => ({ name, rarity: 'regular', url })),
);
await addSeries(
  'skullpanda',
  slug('Special Editions'),
  'Special Editions',
  SKULLPANDA_SPECIAL_EDITIONS.map(([name, url]) => ({ name, rarity: 'regular', url })),
);

console.log('Hirono (manual - data only, images pending):');
for (const [label, rows] of MANUAL_HIRONO) {
  const items = rows.map(([name, rarity]) => ({ name, rarity, url: null }));
  await addSeries('hirono', slug(label), label, items);
}

if (failures.length) {
  console.error('\nAborting without writing; these sets yielded no figures:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

writeFileSync(resolve(__dirname, '../src/data/figures.json'), JSON.stringify(figures, null, 2) + '\n');
writeFileSync(
  resolve(__dirname, 'sources.json'),
  JSON.stringify({ _comment: 'Generated by build-catalog.mjs', figures: sources }, null, 2) + '\n',
);

const sk = figures.filter((f) => f.series === 'skullpanda').length;
const pr = figures.filter((f) => f.series === 'peachriot').length;
const hi = figures.filter((f) => f.series === 'hirono').length;
console.log(`\nTotal ${figures.length} figures (skullpanda ${sk}, peachriot ${pr}, hirono ${hi}).`);
console.log('Next: npm run images  (scrape -> cutout -> upload:catalog)');
