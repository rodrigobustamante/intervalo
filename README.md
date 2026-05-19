# Intervalo

Interpolated real-time sound visualization of urban transit networks. Each train triggers a musical note as it approaches a station — 7 lines, 7 simultaneous voices.

Inspired by [El Organillero](https://organillero.heliouz.com/) (Helios Ocaña) and [TrainJazz](https://www.trainjazz.com/) (Joshua Wolk).

---

## How it works

No backend. No real-time API. The entire animation is interpolated from static GTFS schedule data, processed once at build time.

```
Build time                          Runtime (browser)
──────────                          ─────────────────
GTFS ZIP (Metro SCL / Madrid)       Pre-built JSON
          │                                 │
scripts/process-gtfs.mjs            src/lib/interpolator.ts
          │                         → current train position
          ▼                                 │
public/data/                        src/lib/audio.ts
  lines.json                        → note on station arrival
  stops.json                                │
  schedule.json                     MetroMap (MapLibre GL)
                                    → render + animation loop
```

Each frame, the interpolator calculates every active train's position by linearly interpolating between its scheduled stop times. When a train comes within 30 meters of a station, it plays a short oscillator note — one note per line, one voice per station.

---

## Cities

### Santiago de Chile

- **7 lines**: L1 – L6 + L4A
- **143 stations**
- **~11,500 daily trips**
- **Data source**: Metro de Santiago / DTPM
- **GTFS last updated**: 2026-05-19

### Madrid *(Phase 3)*

- **Metro de Madrid**: 12 animated lines (M3 absent from this GTFS feed — suspended/under renovation)
- **Cercanías Madrid**: 10 lines (Renfe) — stops shown on map, schedule data absent from this GTFS feed
- **Data source**: CRTM + Renfe
- **GTFS last updated**: 2026-05-19

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript strict |
| Styling | Tailwind CSS v3 + shadcn/ui |
| Map | [mapcn](https://mapcn.dev) / MapLibre GL JS |
| Audio | Web Audio API (no libraries) |
| Basemap | CARTO Dark Matter / Positron |
| Deploy | Vercel |

---

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Drop GTFS ZIPs into scripts/gtfs/ (not committed)
#    scripts/gtfs/metro-santiago.zip
#    scripts/gtfs/metro-madrid.zip          (Phase 3)
#    scripts/gtfs/metro-madrid-cercanias.zip (Phase 3)

# 3. Process GTFS → JSON
pnpm run process-gtfs

# 4. Run dev server
pnpm dev
```

`pnpm run build` runs `process-gtfs` automatically as a prebuild step.

---

## GTFS sources

| City | System | Source |
|---|---|---|
| Santiago | Metro de Santiago | [DTPM](https://www.dtpm.cl/index.php/gtfs) |
| Madrid | Metro de Madrid | [CRTM](https://datos.crtm.es/) |
| Madrid | Cercanías Madrid | [Renfe Open Data](https://data.renfe.com/) |

GTFS ZIPs are not committed to the repository — only the generated JSON in `public/data/` is tracked.

---

## Audio

One oscillator note per station arrival. Each line has a fixed note and timbre:

| Line | Note | Oscillator | Color |
|---|---|---|---|
| L1 | C4 | sine | `#C8102E` |
| L2 | E4 | triangle | `#F2A900` |
| L3 | G4 | sine | `#703F2A` |
| L4 | A4 | triangle | `#151F6D` |
| L4A | B4 | sine | `#0072CE` |
| L5 | D5 | triangle | `#00965E` |
| L6 | F5 | sine | `#8E3A80` |

Volume scales with zoom level — zoom out to silence, zoom in to full volume.
Maximum 4 simultaneous notes to prevent saturation.

---

## Credits

- Concept inspired by [El Organillero](https://organillero.heliouz.com/) by Helios Ocaña (Mexico City) and [TrainJazz](https://www.trainjazz.com/) by Joshua Wolk
- Transit data: Metro de Santiago / DTPM, CRTM, Renfe
- Map: [mapcn](https://mapcn.dev) + MapLibre GL + CARTO
