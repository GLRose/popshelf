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
npm run scrape:test                        # tsx --test over scraper/**/*.test.ts
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
`SourceAdapter.discover()` yields `RawItem`, normalize validates it with zod at the boundary so an invalid item becomes a reported skip and never a bad row, and nothing outside `adapters/` may hold selectors or source URLs.

- `src/data/figures.json` stays the catalog of record and is upserted in place.
  There is no Supabase figures table; Supabase holds only `figure_images`, `shelves`, and `favorites`.
- Provenance and incremental crawl state live in committed sidecars at `scraper/state/<ip>.json`.
  The raw-response cache is gitignored at `scraper/.cache/`.
- Scope is **popmart.com only**, no fan wikis or collector sites.
- Cutouts use ML segmentation (`@imgly/background-removal-node`), which replaced the jimp flood-fill and handles staged lifestyle photos as well as clean renders.
  `MIN_FOREGROUND_FRACTION` (2 percent) guards only against degenerate segmentation from a blank or corrupt source, not against a source-image shape.
  Nothing reviews a cutout before publishing, so a figure with no usable result keeps the placeholder gradient rather than shipping a blank.
  The in-app upload path is separate and still flood-fill based (`src/lib/images/removeBackground.ts`), where the 5 percent figure does mean "the background wasn't clean white".

**popmart.com forces a Playwright-driven adapter, not the plain `Fetcher`.**
The collection listing's public CDN JSON only covers the first few pages, and per-figure names and rarity come only from a signed endpoint gated behind Cloudflare Turnstile plus a proprietary device-fingerprint token.
`scraper/adapters/popmart.ts` handles both by loading real pages in headless Chromium and reading the JSON the page's own code produces via `page.waitForResponse`, never by replicating the signature.
This is why `playwright` is a runtime dependency of the scrape script and not just a test dependency.
`options.collectionId` is optional: the adapter resolves it from popmart.com's own `CHARACTERS` nav by `brandLabel`.

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
