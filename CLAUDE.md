# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run web          # dev server at http://localhost:8081 (primary target)
npm run ios          # / npm run android - native, not shipped yet
npm run lint         # expo lint
npm run test:e2e     # full end-to-end suite, see below
npm run build:web    # expo export --platform web -> dist/ (what Vercel runs)
```

Catalog ingestion:

```bash
npm run scrape -- --ip <slug>              # the pipeline; --dry-run, --limit <n>, --force, --full
npm run audit:rarity -- --ip <slug>        # check secret labels against popmart.com; --apply to write them
npm run scrape:test                        # tsx --test over scraper/**/*.test.ts; also the only check on figures.json integrity
npx tsc -p scraper/tsconfig.json           # typecheck the scraper (see two-tsconfigs below)
```

`scripts/*.mjs` (`catalog`, `scrape:download`, `cutout`, `upload:catalog`) are the retired ad-hoc pipeline that `scraper/` replaced.
Prefer `scraper/` for anything new.

`supabase/schema.sql` is not applied by any command.
It is pasted into the Supabase dashboard SQL editor by hand and is written to be safe to re-run.

## Testing

`npm run test:e2e` is the only automated verification, and it is genuinely end-to-end.
`e2e/run.mjs` builds the real web bundle, points it at `e2e/fake-supabase.mjs` (a `node:http` stand-in for GoTrue plus PostgREST that enforces owner scoping the way RLS does), serves it with an SPA fallback, and drives it with Playwright.
No Supabase project, network, or credentials are needed.

Assert against the stub's `/__state`, not against the UI.
The UI updates optimistically and will look correct even when nothing reached the server.

Traps that have each cost real time:

- `--clear` on `expo export` is mandatory.
  Metro otherwise reuses a cached bundle with the production `EXPO_PUBLIC_SUPABASE_URL` baked in, so the suite passes while hitting the real project.
- Load `http://host:port/`, never `/index.html`.
  expo-router renders "Unmatched Route" with zero page errors, which is indistinguishable from the app rendering empty data.
- Playwright locators against react-native-web: `accessibilityLabel` becomes `aria-label`, so `getByLabel()` reaches inputs.
  But buttons built from `<Pressable><Text>` take their accessible name from their text, so they need `getByRole('button', { name })`.
  `getByLabel('Password')` is a substring match that also hits the "Show password" toggle, so pass `{ exact: true }`.
- supabase-js persists its session in `localStorage` under `sb-localhost-auth-token`, keyed off the URL's first hostname label.
  AsyncStorage-on-web writes it raw, so it can be seeded directly to simulate an upgrading device.
- Never `pkill -f <pattern>` here.
  The pattern matches the invoking shell's own command line and kills the tool session. Find the pid with `ss -lptn 'sport = :PORT'`.

## Environment

`.env` holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).
Both are absent-tolerant by design: `src/lib/supabase.ts` exports `null` when unset and every remote path checks for it.
The app is fully usable with no backend, so never add a code path that assumes `supabase` is non-null.

Publishing catalog images additionally needs `SUPABASE_SERVICE_ROLE_KEY`.
That key bypasses RLS and must stay in `.env` on Garrett's machine only, never in the app bundle.

Dashboard settings that SQL cannot express are documented in the header of `supabase/schema.sql`, which is the authority.
In short: Email provider ON, "Allow new users to sign up" ON, **Confirm email OFF**, Anonymous sign-ins OFF.
Confirm email must stay off because the free tier's built-in SMTP is rate-limited and only delivers to project team members, so a confirmation requirement is not something real users can satisfy.
The client already handles the no-session-yet result, so turning it on later is a dashboard change and not a code change.

## Architecture

Expo Router file-based routing under `src/app/`: three tabs (Browse / Shelf / Favorites) plus `admin` and `account` modals.
`src/app/_layout.tsx` hydrates the three zustand stores at startup.

### Finding a figure in Browse

Two things sit above the grid, and neither touches the network.

`src/lib/search.ts` searches the **whole catalog**, deliberately ignoring the series toggle and the set filter, because not knowing which IP a figure belongs to is a common reason to reach for search.
A query is split into tokens, each token is scored against the figure's name, its set, and its IP (label *and* slug, so "peach riot" and "peachriot" both work), and a figure only survives if **every** token landed somewhere.
That is what makes adding a word narrow the results instead of widening them.

Results are grouped into sets, and the group score carries a coverage bonus: matching *all* of a set outranks matching one stray figure in a dozen sets.
Without it "po" put The Polar Bear above Power Chords, which is the opposite of what was typed.
The bonus is halved unless every token hit the set name at a word boundary, because a mid-word substring sweeps a whole set in too ("po" is inside "Sleepover") and that is not the same as naming it.
The index is built once at module load, not per keystroke, and `useDeferredValue` keeps the typing ahead of the re-render.

The **Secrets** chip in `SetFilter` collapses an IP's secrets into one section.
A secret is the one figure per set a collector chases, and it was otherwise a badged card at the end of each of twenty sets.
The chip is gold rather than the IP accent so it reads as the same promise the SECRET badge on the card makes.
`e2e/search.spec.mjs` guards both, including that the secrets view contains nothing but secrets.

### Local-first collection

`src/store/useCollection.ts` is the center of gravity.
AsyncStorage is the source of truth; Supabase is a mirror that only exists once there is an account to own the rows.
Hydration loads local first and returns immediately when signed out, so the UI never waits on the network.
Mutations apply locally and fire a best-effort remote push that warns rather than throws, and a store subscriber writes every post-hydration change back to disk.

`adoptRemoteCollection()` is the only path by which a device's shelves acquire an owner, and it runs on sign-up, sign-in, and on launch when already signed in.
It unions in both directions.
The `isUntouched()` check matters: an untouched starter shelf is a placeholder rather than a user decision, and merging it would trail an empty "My Shelf" behind the user's real shelves on every new device they sign in on.

### Auth is email and password only

No anonymous sessions, no emailed codes, no magic links.
`src/lib/auth.ts` explains why the previous OTP flow was removed: it had to guess from an `email_exists` error whether to link or sign in, producing two different `auth.uid()` outcomes, one of which purged and re-uploaded the whole collection.

Signed out is the resting state, not a failure.
A signed-out device sends the anon key and hits RLS as `anon`; a signed-in one sends its access token and hits it as `authenticated`.
Anything a browsing user must read has to name **both** roles in `supabase/schema.sql`: granting only `to authenticated` locks out every signed-out visitor, and granting only `to anon` locks out every signed-in one.

`currentUserId()` deliberately reports a restored *anonymous* session as no user.
Devices running the previous build still have one persisted, and supabase-js will keep handing it back, so without that check an upgrading user would silently write rows as an identity they can never sign into again.
`retireAnonymousSession()` clears it for good and pointedly does **not** touch the local collection, since those shelves are the user's real data and the first sign-in folds them into a proper account.

`supabase/schema.sql` ends with a commented-out, deliberately unrun cleanup for the anonymous users earlier builds created.
Read the ordering note there before running it: `figure_images.owner_id` cascades, so approved community images must be detached before the users are deleted.

### Figure images

The app bundles no images at all.
Cutouts used to be committed under `assets/figures/` and `require()`d into the binary, where they beat everything else and could not be updated without shipping a new build.
Everything is a `figure_images` row now, served straight from a public storage bucket.

The `source` column splits those rows in two, and the difference is who can destroy them:

- `catalog` is the app's own artwork, written with the service role key, owner-less and born approved.
  No client, moderator or not, can update or delete it. The RLS policies deliberately put it out of reach, because moving it into Supabase otherwise placed it one mis-tap in the moderation screen away from being purged.
- `community` is a user submission a moderator approved. Replaceable and revocable.

A figure can hold one approved row of each at once, which is why the unique index is per `(figure_id, source)`.
`fetchApprovedImages()` collapses them, preferring community, so revoking a bad community image reveals the original catalog art underneath instead of a placeholder.
By the time it reaches the store there is a single `community` slot.

`src/components/figures/FigureImage.tsx` therefore resolves just `mine ?? community`, then falls back to a gradient placeholder.
`src/store/useUserImages.ts` keeps `mine` and `community` as separate slots deliberately.
They shared one slot originally, which let an approved image overwrite the user's pick.

**The two slots are stored differently, and that asymmetry is the whole performance story.**
`mine` is a local file, because an image the user picked but never got approved exists nowhere else.
`community` is only a URL, resolved once per launch from one query and never downloaded until something on screen asks for it.

The app used to mirror every approved image into local storage at startup.
That is what made new users stare at placeholders: the bucket was private, so listing the catalog cost a `createSignedUrl` round trip *per figure* - measured at 412 of them - and no image could start downloading until all of them finished.
First artwork landed ~10s after the app shell on a throttled connection; it is now ~170ms, and only the dozen images actually on screen are fetched.
`e2e/images.spec.mjs` guards the shape of that waterfall: one query, zero signing calls, no `blob:` URLs.

Deleting that mirror also deleted the bookkeeping it needed - the sync manifest and the reconcile-and-prune pass.
`community` is rebuilt from the server every launch, so a replaced image is just a different URL and a revoked one is just absent.
A failed fetch still leaves the slot alone rather than emptying it, since an empty result is indistinguishable from "everything was revoked".

On web the local cache is IndexedDB `popshelf-user-images` / store `images`, keyed `mine:<figureId>` only.
`loadUserImages()` deletes any `community:` keys it finds, reclaiming the old catalog mirror; the native store deletes `user-figures/community/` the same way.

Moderation is reached by tapping the Browse title five times.
Reject and revoke are the same operation: tombstone the row to `rejected`, delete the storage object, then delete the row.
Object-then-row ordering is deliberate, since the reverse strands bytes with nothing left to find them by.

### Scraper pipeline

`scraper/` is config-driven ingestion, run via `tsx`.
Upsert identity is `(source, sourceProductId)`.
That is recorded in the sidecar, so it only makes runs *after the first* idempotent.
On the first run over an IP the sidecar is empty, and if that IP was already curated by hand the scraper meets its own ids sitting in the catalog already.
It used to assume a coincidental slug collision and fork a `-2` twin beside every row, which is how hirono ended up with 68 duplicated figures.
`resolveId` now adopts an existing row whose `series`/`set`/`name` slug back to the id it wants, and only suffixes a genuinely different figure.
`commit()` refuses to write a catalog containing two rows with the same id or the same identity, so this class of bug cannot reach `figures.json` again.
`scraper/db/catalog.test.ts` re-checks the committed file, via the same `findCatalogDuplicates` the guard uses.

Deleting a row from `figures.json` is never enough on its own.
`resolveId` short-circuits on the sidecar, so the next run re-inserts anything you removed unless `scraper/state/<ip>.json` is rewritten to match.
Clearing an item's `imageHash` there is what forces its artwork to republish under a new id; leaving it makes `ingestImages` skip the figure as unchanged.
Catalog `figure_images` rows left behind are unreachable and undeletable by any client, so `scripts/prune-orphan-catalog-images.mjs` (service role, `--apply` to act) is the only way to clean them up.
`SourceAdapter.discover()` yields `RawItem`, normalize validates it with zod at the boundary so an invalid item becomes a reported skip and never a bad row, and nothing outside `adapters/` may hold selectors or source URLs.

- `src/data/figures.json` stays the catalog of record and is upserted in place.
  There is no Supabase figures table; Supabase holds only `figure_images`, `shelves`, and `favorites`.
- Provenance and incremental crawl state live in committed sidecars at `scraper/state/<ip>.json`.
  The raw-response cache is gitignored at `scraper/.cache/`.
- Scope is **popmart.com only, with one deliberate exception**: `scraper/adapters/toypool.ts` reads thetoypool.com, because POP BEAN has no per-design data on popmart.com at all (see below).
- Cutouts are an edge-seeded **jimp flood fill** (`cutout()` in `scraper/images/ingest.ts`), not ML segmentation.
  `@imgly/background-removal-node` was tried and reverted: it is a saliency segmenter, so it ate white *inside* the figure and emitted feathered alpha. The flood fill is connectivity-based (interior white is untouchable by construction) and binary (edges stay crisp).
  A pixel counts as background if it is already transparent, or if it is near-white and neutral. The transparency clause matters: Pop Mart's own renders arrive pre-isolated but are inconsistent about what RGB they leave under the alpha, and the ones hiding near-black there used to be rejected outright.
  `MIN_BACKGROUND_FRACTION` (5 percent) is what rejects a staged lifestyle photo, which has no flat background to remove.
  Nothing reviews a cutout before publishing, so a figure with no usable result keeps the placeholder gradient rather than shipping a blank.
  The in-app upload path is separate and shares the algorithm (`src/lib/images/removeBackground.ts`).

**popmart.com forces a Playwright-driven adapter, not the plain `Fetcher`.**
The collection listing's public CDN JSON only covers the first few pages, and per-figure names and rarity come only from a signed endpoint gated behind Cloudflare Turnstile plus a proprietary device-fingerprint token.
`scraper/adapters/popmart.ts` handles both by loading real pages in headless Chromium and reading the JSON the page's own code produces via `page.waitForResponse`, never by replicating the signature.
This is why `playwright` is a runtime dependency of the scrape script and not just a test dependency.
`options.collectionId` is optional: the adapter resolves it from popmart.com's own `CHARACTERS` nav by `brandLabel`.

**The collection pager is broken on Pop Mart's side as of 2026-07-25, so the `popmart` adapter cannot run.**
Their `common/v1/common/get_location_by_ip` answers 500 and the storefront's own JS then dies with an uncaught `TypeError` before it ever requests the product list, in headless and headed Chromium alike, on every country path.
Nothing in this repo causes it and nothing here can work around it: the pager is the only route to the pages past the CDN snapshot's first three.

**Ingestion is not blocked by that, because of `scraper/adapters/popmartRoster.ts`.**
The sitemap route the rarity audit always used still works, and it turned out to carry everything an ingest needs: each `toy` in a product's roster has a name, Pop Mart's authoritative `type === 2` secret flag, *and* a per-design render URL that `discoverRosters()` was simply discarding.
So `popmart-roster` is a thin `SourceAdapter` over that same walk, and it is what tinytiny, sweetbean and popbean are ingested with.
The one field it cannot supply is `year`, which only ever came from the collection listing.

Two shapes of product need care on this route:

- A **standalone, non-blind-box release** ("TINYTINY LULLABY FIGURE") legitimately has no roster. `allowSingles` turns it into a set of one named after itself, with the first gallery banner as its art.
  It is gated on the title ending in the *singular* "Figure"/"Figurine", and that gate is load-bearing: a real twelve-design series whose roster failed to load ("Sweet Bean Afternoon Tea Series **Figures**") would otherwise be flattened into a single figure, which is worse than missing because it looks complete.
- Pop Mart's title casing is per-IP inconsistent - TinyTiny's are wholly uppercase - so `titleCaseIfShouting()` (`scraper/core/text.ts`) cases a set name only when it has no lowercase in it at all.
  It runs *after* the trailing "Series" is stripped, since that word's own lowercase would otherwise mask the check.

### Auditing secret labels

`scraper/audit-rarity.ts` (`npm run audit:rarity -- --ip <slug>`) exists because `rarity` was only ever right for the IPs the pipeline ingested.
dimoo and hirono came in through `discover()`, which reads Pop Mart's per-design `toy.type === 2`; skullpanda and peachriot were curated by hand years earlier and had their secret sitting in the catalog labeled `regular` in all but three sets.
The audit re-asks popmart.com and writes back **only** `rarity`, never an id, name, row or sidecar, so correcting a label costs nothing like a re-ingest.
It matches on `slug(set)/slug(name)` and reports anything it cannot match one-to-one rather than guessing, which is how `Gigi Lil%27 Lead` (a URL-encoded apostrophe reaching the UI) surfaced.

It reaches sets through `discoverRosters()`, a second, sitemap-driven entry point in the popmart adapter, not through `discover()`.
That is what makes it usable while the pager is down: `sitemap-products.xml` is plain unsigned XML listing every product Pop Mart publishes, and a product page still answers with its roster.
The trade is `upTime`, and so a figure's `year`, which only the collection listing carries - a field an audit does not need and an ingest does.

Pop Mart only publishes what it still sells.
Twelve delisted sets (skullpanda City of Night, Ancient Castle, The Mare of Animals, L'Impressionnisme, Winter Symphony, Laid Back Tomorrow, The Addams Family, Candy Monster Town, Action Cut, HYPEPANDA, You Found Me, and peachriot Lil Peach Riot Loading) have no roster on any Pop Mart surface in any country, so their secrets came from collector sources instead and are the only labels in the catalog that popmart.com has not confirmed.
`scraper/db/rarity.test.ts` holds the line from here: one secret per set, with an explicit list of the non-blind-box sets that have none and the handful that ship two or three.
It carries a third list, `UNLABELLED_SECRET_SETS`, for the POP BEAN waves whose secret nothing can tell us - deliberately not folded into `NO_SECRET_SETS`, because "we do not know" and "there is none" are different claims and only one of them is true here.

### POP BEAN, and what is not in it

POP BEAN is a **format, not an IP**: a bean-shaped mini of a character borrowed from another line (Labubu, Molly, Dimoo, Crybaby, Pucky...).
It is absent from Pop Mart's own CHARACTERS nav, which is the first sign it is not modelled like the others.

It is one `popbean` series whose sets are the waves, with the borrowed character in the figure name ("Labubu - The Best One").
The alternative - a series per character - was rejected because it promises mainline catalogs that do not exist: a user tapping MOLLY would find three beans and nothing else.
`formatFigureName()` in the toypool adapter inserts that separator from a known-character list, longest match first, and passes a name through unchanged when nothing matches (the licensed waves are cast members, not IPs: "Cedric Diggory").

**Coverage is 100 figures across 7 waves, and that is not all of them.** hobbyDB catalogues 525+.
The shortfall is not laziness, it is that no readable source covers the rest:

- popmart.com answers with an **empty roster for nearly every POP BEAN product** (Lucky Charm, Fortune Bag, Mini Ice Pop, THE MONSTERS Hair Salon, Ice Cream, Winter Romance, Coffee Factory all return `toys: []`). The collaboration waves are the exception - DIMOO WORLD × PIXAR returns a full 13 - which is why `popmart-roster` is still listed as a source for this IP.
- thetoypool.com covers 6 waves and no more.
- These waves are therefore sold by Pop Mart but absent from the catalog entirely: Coffee Factory, Bubble Tea, Pajama Party, Baked Bread, Ice Cream, SUSHI, Winter Romance, Macaron Dessert, Goodnight Night Sky, Celebrate This Moment, Going Outing With Me, Pajama Cross Dressing, Fluffy & Cozy, THE MONSTERS Hair Salon, DIMOO WORLD × DISNEY Classic.

Closing that gap means a hobbyDB adapter, which is JS-rendered and so a Playwright job rather than the plain fetch toypool needs.

Two smaller consequences worth knowing:

- The 13 DIMOO WORLD × PIXAR figures have **no artwork**. Their `toy.url` images are staged lifestyle photos on tan and orange backgrounds, so `cutout()` rejects them, which is the guard working correctly. They render the placeholder gradient.
- **SWEET BEAN is a different thing from POP BEAN** and is its own IP - own character, in the CHARACTERS nav, and its product pages do answer with rosters. It is ingested through `popmart-roster` like TinyTiny.
  Its Afternoon Tea and × INSTINCTOY Sweet Together series are real multi-design sets whose rosters do not load, so they are absent rather than flattened into one figure each.

### Two gotchas that will bite

**Two tsconfigs.**
The scraper is Node-only and needs `@types/node`, but the app is a React Native environment.
So `scraper/tsconfig.json` sets `types: ["node"]` and the root tsconfig `exclude`s `scraper`.
Typecheck the scraper with `npx tsc -p scraper/tsconfig.json` or its errors go unseen.

**A new IP is not config-only.**
The pipeline is series-agnostic (`StoredFigure.series` is a plain `string`) and will happily write any IP slug into `figures.json`.
But the app only renders IPs present in the closed `Series` union.
Onboarding one requires the same three-file touch every time: `src/types.ts`, `src/constants/palette.ts` (SERIES / SERIES_ORDER / palette), and the glyph map in `src/components/figures/FigureImage.tsx`.

## Known gap

Moderation is still unguarded.
`supabase/schema.sql` grants read, status flips, and delete on `community` rows to both roles, so any client can approve or destroy any community image.
Catalog artwork is not exposed to this, by design.
Before release this needs real access control; now that accounts exist, an `admins` table keyed by `auth.uid()` is finally possible.
