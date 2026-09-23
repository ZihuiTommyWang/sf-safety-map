# SF Safety Map

**Live: https://zihuitommywang.github.io/sf-safety-map/**

An interactive safety map of San Francisco built on real SFPD incident reports — free, open
source, no ads, no tracking, no backend.

Inspired by safemap.io, but built to go further:

| | safemap.io | SF Safety Map |
|---|---|---|
| Heatmap + category/date/time filters | ✅ | ✅ |
| See the *actual incidents* (zoom → dots → click for details) | ❌ | ✅ |
| Hour-of-day animation (watch neighborhoods change 2 PM → 2 AM) | ❌ | ✅ |
| Shareable filter URLs | ❌ | ✅ |
| Open methodology & source | ❌ | ✅ |
| Ads | 🙃 | none |
| Incidents plotted (12 mo) | ~10k | ~50k |
| Admin noise (warrants, lost property, traffic stops) filtered out | ❌ | ✅ |

## How it works

- **Data**: [DataSF Police Incident Reports](https://data.sf.gov/d/wg3w-h783) (2018–present
  dataset), last 12 months, fetched by `scripts/build-data.mjs` into compact columnar JSON
  (~1.7 MB, ~350 KB gzipped). The deploy workflow fetches fresh data from DataSF on every
  run (generated data is never committed), a nightly workflow triggers a redeploy, and the
  build fails loudly — keeping the previous deploy live — if DataSF is down, volumes look
  wrong, or SFPD's category vocabulary drifts. Reports with unrecorded times (logged by
  SFPD as exact midnight) are kept on the map but excluded from time-of-day filtering.
  Only reports that represent real place-based harm are kept: police paperwork (warrants,
  stops, investigations), non-place-based harm (fraud, harassing calls, domestic violence),
  perception-only reports, and shoplifting are filtered out — see
  [`scripts/categories.mjs`](scripts/categories.mjs) for the full philosophy and mapping.
- **Frontend**: Vite + React + TypeScript + [MapLibre GL](https://maplibre.org/), CARTO
  dark-matter basemap. Rendering is "exposure fireflies": every incident is one amber dot,
  and dots overexpose toward white-hot as their block's incident density climbs the citywide
  percentiles — like a long-exposure photo. Nothing is smoothed; every dot is clickable and
  shows the underlying reports. Density tiers recompute live for the active filters.
- **Hosting**: GitHub Pages. There is no server — everything is static.

## Development

```bash
npm install
npm run build-data   # fetch fresh incident data from DataSF
npm run dev          # local dev server
```

Look-and-feel knobs (heat ramp, category colors, zoom thresholds, presets) live in
[`src/config.ts`](src/config.ts) and [`scripts/categories.mjs`](scripts/categories.mjs).

## Caveats

Reported incidents ≠ risk: report density also reflects police presence, foot traffic, and
reporting habits. SFPD anonymizes locations to block/intersection level. See the Methodology
panel in the app for the full story.

## Credits

Incident data: [DataSF](https://data.sf.gov/) (Public Domain). Basemap © [CARTO](https://carto.com/),
© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
