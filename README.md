# PopShelf

Browse every **Skullpanda** and **Peach Riot** figure from Pop Mart, build a collection, favorite the ones you love, and display them on a customizable virtual shelf.

Built with **Expo + Expo Router + React Native Web** so the same codebase runs on the web today and can ship to iOS/Android later with no rewrite.

## Features

- **Browse** - toggle between Skullpanda and Peach Riot, browse figures grouped by series/set. Tap **+** to collect, **♥** to favorite. Per-series collection progress.
- **Shelf** - your collected figures sit as cutouts on a paginated shelf. Customize **shelf color** and **background**. Edit mode to remove figures.
- **Favorites** - favorited figures kept separately, off the shelf. Unfavorite anytime.
- **Local persistence** - collection, favorites, and shelf settings are saved on-device and restored on return.
- **Accounts** - sign up with an email and password and your shelves follow you to any device. Optional: the app is fully usable signed out.

## Run locally

```bash
npm install
npm run web        # http://localhost:8081
# npm run ios / npm run android for native
```

## Accounts

The app is **local-first**. Shelves and favorites live in AsyncStorage and work with no account, no network, and no Supabase project at all.
Signing in is what gives them an owner, after which they sync and survive a reinstall, a new phone, or a cleared browser.

Signing in **merges** rather than replaces: the shelves on the device are unioned with the ones already in the account, in both directions, and nothing is dropped.
That is what lets someone collect for a while, then create an account, and keep everything they built.
Signing out returns the device to local-only and clears its copy - the account keeps it, and the next sign-in brings it back.

Auth is email + password only (`src/lib/auth.ts`). There are no emailed codes, magic links, or anonymous sessions.

### Supabase setup

Copy `.env.example` to `.env` and fill in the URL + anon key, then run `supabase/schema.sql` in the SQL editor.

Four dashboard settings under **Authentication > Sign In / Providers** are not expressible in SQL, and the app assumes them:

| Setting | Value | Why |
| --- | --- | --- |
| Email provider | **on** | The only way in. |
| Allow new users to sign up | **on** | Otherwise `signUp()` fails with `signup_disabled`. |
| Confirm email | **off** | Sign-up returns a session immediately, so no mail is ever sent. |
| Anonymous sign-ins | **off** | No longer used. |

**Confirm email must be off.** The free tier's built-in SMTP is rate-limited to a handful of messages an hour and only delivers to project team members, so a confirmation requirement is not something real users can satisfy - signup fails with `over_email_send_rate_limit`.
Turning it back on needs a custom SMTP provider, and needs no code change: the client already handles the no-session-yet result.

### Testing it locally

```bash
npm run test:e2e
```

Builds the real web bundle, points it at a local stand-in for Supabase (`e2e/fake-supabase.mjs`, which enforces owner scoping the way RLS does), and drives it in a headless browser.
Needs no Supabase project, no network, and no credentials.
It covers the whole lifecycle - signed-out writes nothing, sign-up adopts the device's shelves, sign-out empties the device but not the account, a second device merges, a reinstall restores - plus the upgrade path for a device still holding an anonymous session from an older build.

## Deploy to Vercel

`vercel.json` is already configured. Import the repo in Vercel (or `vercel --prod`). It runs `expo export --platform web` and serves the SPA from `dist/`.

Full refresh:

```bash
npm run refresh    # catalog -> scrape -> cutout -> upload:catalog
```

Or step by step:

1. `npm run catalog` - scrape names + image URLs → `figures.json` + `sources.json`.
2. `npm run scrape` - download raw images to `catalog-images/raw/` (gitignored).
3. `npm run cutout` - background-remove to transparent `catalog-images/cutouts/<id>.png`.
   Uses a pure-JS edge flood-fill (`jimp`) - no native deps or ML model - which
   works because the source renders sit on clean white backgrounds.
4. `npm run upload:catalog` - publish the cutouts to Supabase. Needs
   `SUPABASE_SERVICE_ROLE_KEY` in `.env`; idempotent, so re-running replaces
   artwork in place.

`npm run missing-images` regenerates `NEEDED-IMAGES.md`, the checklist of figures
still showing a placeholder. It asks Supabase, since that's where the images are.

### Where the images live

**Supabase, and nowhere else.** The app bundles no figure artwork. Every image -
the catalog's own art and anything a user submits - is a row in `figure_images`
plus an object in the private `figure-images` bucket, synced down on launch and
cached on the device (`src/store/useUserImages.ts`). See `supabase/schema.sql`.

`catalog-images/` is a local working area for the pipeline above, not part of the
app, and is gitignored. Cutouts used to be committed under `assets/figures/` and
compiled into the binary as a static `require()` map, which meant 25MB of PNGs in
every build and no way to fix a bad image without shipping a new one.

The two kinds of image differ only in who may destroy them. Catalog art
(`source = 'catalog'`) is written solely by the service role key and is out of
reach of every client, moderator included; community submissions
(`source = 'community'`) go through the review queue and can be revoked. A figure
can hold one of each - the community's wins, and revoking it falls back to the
catalog art rather than a placeholder.

**Coverage / known gaps:** all 17 documented Skullpanda blind-box series are
included. Peach Riot is limited to the two series with a clean image source
(Rise Up, Punk Fairy) - other Peach Riot sets need an image source before they
can be added. Any figure with no image falls back to a styled placeholder
automatically. Images are Pop Mart's copyright - intended for personal use.

## Going mobile later

The UI is 100% React Native primitives + Expo modules, so `eas build -p ios` / `-p android` produces native apps from this same repo. State/persistence (`@react-native-async-storage/async-storage`) and images (downloaded from Supabase into the app's documents dir, `src/lib/userImageStore.ts`) already work on native.

## Structure

```
src/
  app/(tabs)/    index (Browse), shelf, favorites + _layout (tabs)
  components/    FigureCard, FigureImage, SeriesToggle, Shelf, ShelfItem, Paginator, ShelfCustomizer
  store/         useCollection (zustand + persist), useUserImages (Supabase image sync + cache)
  data/          figures.json, figures.ts
  lib/           supabase, auth, remoteFigureImages, userImageStore
  constants/     palette, appTheme
scripts/         gen-catalog, scrape, remove-bg, upload-catalog-images, missing-images
```
