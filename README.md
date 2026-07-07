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
