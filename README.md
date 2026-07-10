# PopShelf

Browse every **Skullpanda** and **Peach Riot** figure from Pop Mart, build a collection, favorite the ones you love, and display them on a customizable virtual shelf.

Built with **Expo + Expo Router + React Native Web** so the same codebase runs on the web today and can ship to iOS/Android later with no rewrite.

## Features

- **Browse** - toggle between Skullpanda and Peach Riot, browse figures grouped by series/set. Tap **+** to collect, **♥** to favorite. Per-series collection progress.
- **Shelf** - your collected figures sit as cutouts on a paginated shelf. Customize **shelf color** and **background**. Edit mode to remove figures.
- **Favorites** - favorited figures kept separately, off the shelf. Unfavorite anytime.
- **Local persistence** - collection, favorites, and shelf settings are saved on-device and restored on return.

## Run locally

```bash
npm install
npm run web        # http://localhost:8081
# npm run ios / npm run android for native
```

## Supabase auth config

Sign-in emails a verification link (`src/lib/auth.ts`), and that depends on project settings that live in the Supabase dashboard rather than in this repo.
Get them wrong and the failure is silent, because `/auth/v1/verify` consumes the token *before* it redirects.
A project ships with Site URL set to `http://localhost:3000`, so every link lands on a dead port, and yet an email-change link still appears to work (it mutates the user the app is already signed in as) while a magic-link sign-in does not (its session is delivered to that dead redirect and thrown away).
That asymmetry reads as flakiness rather than as a misconfiguration.

Site URL and the redirect allow list are versioned in `scripts/push-auth-config.mjs`, and pushed to the hosted project with:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:config   # add --dry-run to preview
```

Create the token at <https://supabase.com/dashboard/account/tokens>.
The script reads the config back afterwards to confirm it landed.
Note that `supabase/config.toml` cannot do this job, since it only ever configures a local dev stack.

The dashboard must also have **Anonymous Sign-Ins** and **Allow new users to sign up** enabled, under Authentication > Sign In / Providers.

### Email delivery is not production ready

Supabase's built-in email sender **only delivers to members of the project's organization**.
Everyone else gets `Email address not authorized` and cannot sign in at all, which is invisible while testing because the person testing is always on the team.
It is also capped at two emails per hour, and a free-tier project using it is forbidden from editing its email templates.

That template lock is why this is a link flow and not a 6-digit code flow: the stock templates render `{{ .ConfirmationURL }}` and never `{{ .Token }}`, so no code can ever reach a user.
Configuring custom SMTP under Authentication > Emails lifts all three limits at once, and is required before release.

## Deploy to Vercel

`vercel.json` is already configured. Import the repo in Vercel (or `vercel --prod`). It runs `expo export --platform web` and serves the SPA from `dist/`.

Full refresh:

```bash
npm run refresh    # catalog -> scrape -> cutout -> imagemap
```

Or step by step:

1. `npm run catalog` - scrape names + image URLs → `figures.json` + `sources.json`.
2. `npm run scrape` - download raw images to `assets/figures/raw/` (gitignored).
3. `npm run cutout` - background-remove to transparent `assets/figures/<id>.png`.
   Uses a pure-JS edge flood-fill (`jimp`) - no native deps or ML model - which
   works because the source renders sit on clean white backgrounds.
4. `npm run imagemap` - regenerate `src/data/figureImages.ts` (static `require()`
   map so React Native can bundle the PNGs).

**Coverage / known gaps:** all 17 documented Skullpanda blind-box series are
included. Peach Riot is limited to the two series with a clean image source
(Rise Up, Punk Fairy) - other Peach Riot sets need an image source before they
can be added. Any figure without a cutout falls back to a styled placeholder
automatically. Images are Pop Mart's copyright - intended for personal use.

## Going mobile later

The UI is 100% React Native primitives + Expo modules, so `eas build -p ios` / `-p android` produces native apps from this same repo. State/persistence (`@react-native-async-storage/async-storage`) and images (static `require` map) already work on native.

## Structure

```
src/
  app/(tabs)/    index (Browse), shelf, favorites + _layout (tabs)
  components/    FigureCard, FigureImage, SeriesToggle, Shelf, ShelfItem, Paginator, ShelfCustomizer
  store/         useCollection (zustand + persist)
  data/          figures.json, figures.ts, figureImages.ts
  constants/     palette, appTheme
scripts/         gen-catalog, scrape, remove-bg, gen-image-map
```
