# Intervalo — Santiago de Chile and Madrid

Interpolated real-time sound visualization of Santiago's Metro (after Santiago, Madrid).
Each train triggers a note when approaching a station. 7 lines, 7 simultaneous voices.

Inspired by [El Organillero](https://organillero.heliouz.com/) (CDMX) and [TrainJazz](https://www.trainjazz.com/).

---

## GTFS data — last updated

**Always update this section and the README.md `Cities` section whenever a new GTFS ZIP is processed.**

| City | System | ZIP file | Last updated |
|---|---|---|---|
| Santiago | Metro de Santiago (DTPM) | `metro-santiago.zip` | 2026-05-19 |
| Madrid | Metro de Madrid (CRTM) | `metro-madrid.zip` | 2026-05-19 |
| Madrid | Cercanías Madrid (Renfe) | `metro-madrid-cercanias.zip` | 2026-05-19 |

When running `process-gtfs.mjs` with a new ZIP:
1. Update the date in this table for the affected ZIP
2. Update the matching city's "GTFS last updated" line in `README.md`

---

## Stack

- **Next.js 14** (App Router, `src/` directory)
- **TypeScript** strict mode
- **Tailwind CSS** + **shadcn/ui**
- **mapcn** ([mapcn.dev](https://mapcn.dev)) — MapLibre GL JS wrapper
- **Web Audio API** native (no audio libraries)
- **Vercel** deploy (static-friendly, no backend)

---

## Architecture

```
Build time                      Runtime (browser)
──────────                      ─────────────────
GTFS ZIP (Metro SCL)            Pre-built JSON
        │                               │
scripts/process-gtfs.mjs        src/lib/interpolator.ts
        │                       → current train position
        ▼                               │
public/data/                    src/lib/audio.ts
  lines.json                    → note on station arrival
  stops.json                            │
  schedule.json                 MetroMap (mapcn + GeoJSON layers)
                                → render + animation loop
```

No backend, no API routes, no database.
GTFS is processed once at build time and served as static JSON from `public/data/`.

---

## File structure

```
metro-sonoro-stgo/
├── CLAUDE.md
├── scripts/
│   └── process-gtfs.mjs         ← parses GTFS ZIP, emits public/data/
├── public/
│   └── data/
│       ├── lines.json            ← geometry + color + note per line
│       ├── stops.json            ← stations with coords + line_id
│       └── schedule.json         ← trips with stop_times for interpolation
├── src/
│   ├── lib/
│   │   ├── gtfs-types.ts         ← TypeScript types for data model
│   │   ├── interpolator.ts       ← pure functions: where is the train now
│   │   └── audio.ts              ← Web Audio API: oscillators, notes per line
│   ├── components/
│   │   ├── MetroMap.tsx          ← root component: loads JSON, mounts map
│   │   ├── TrainLayer.tsx        ← GeoJSON layer with interpolated train positions
│   │   └── StationPingLayer.tsx  ← visual flash on station arrival
│   └── app/
│       ├── layout.tsx
│       └── page.tsx              ← minimal shell, renders MetroMap
├── components.json               ← shadcn/ui config
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## GTFS data

### Source

Santiago Metro static GTFS from Chile's Ministry of Transport.
Reference URL (verify before use): https://www.dtpm.cl/index.php/gtfs

Standard GTFS ZIP: `agency.txt`, `routes.txt`, `trips.txt`, `stops.txt`, `stop_times.txt`, `shapes.txt`, `calendar.txt`.

### Processing script

`scripts/process-gtfs.mjs` must:

1. Read ZIP from `scripts/gtfs/metro-santiago.zip` (do not commit the ZIP, only the generated JSON)
2. Parse `.txt` files with `csv-parse` (use streams for `stop_times.txt` which can be large)
3. Filter Metro only (exclude Metrotrén or Red Metropolitana if present in the same feed)
4. Emit three JSON files to `public/data/`

### JSON output formats

**`lines.json`**

```json
[
  {
    "id": "L1",
    "name": "Línea 1",
    "color": "#EF4135",
    "note": "C4",
    "oscillatorType": "sine",
    "shape": [[lng, lat], [lng, lat]]
  }
]
```

**`stops.json`**

```json
[
  {
    "id": "stop_123",
    "name": "Baquedano",
    "lineId": "L1",
    "coords": [-70.6372, -33.4411]
  }
]
```

**`schedule.json`**

```json
[
  {
    "tripId": "trip_abc",
    "lineId": "L1",
    "serviceId": "L_D",
    "stopTimes": [
      {
        "stopId": "stop_001",
        "arrival": 28800,
        "departure": 28800,
        "coords": [-70.65, -33.45]
      },
      {
        "stopId": "stop_002",
        "arrival": 29040,
        "departure": 29040,
        "coords": [-70.63, -33.44]
      }
    ]
  }
]
```

Times are seconds since midnight (standard GTFS format).

---

## Interpolator

`src/lib/interpolator.ts` — pure logic, no side effects, fully testable.

Given a `trip` and current time in seconds, returns `[lng, lat]` of the interpolated train position, or `null` if the trip is not active.

### Algorithm

```
1. Convert Date.now() to seconds since midnight
2. Find active segment: pair (stopA, stopB) where stopA.departure <= now < stopB.arrival
3. t = (now - stopA.departure) / (stopB.arrival - stopA.departure)
4. Lerp between stopA.coords and stopB.coords, t clamped to [0, 1]
5. Return [lng, lat]
```

### Station arrival detection

A train "arrives" when its interpolated position is within 30 meters of a station.
Use simplified Haversine (no library needed).

### Schedule filtering

GTFS `service_id` varies by weekday (`calendar.txt`).
The interpolator receives the current weekday to filter active trips.
MVP assumption: weekday service on Mon–Fri, weekend otherwise.

---

## Audio

`src/lib/audio.ts` — singleton managing the `AudioContext`.

### Rules

- `AudioContext` created only after user interaction ("Enter" button) — browser autoplay policy
- One note per station arrival event
- Note corresponds to the arriving train's line
- Each note: oscillator with short envelope (attack 5ms, decay 200ms, release 100ms)
- Max 4 simultaneous notes to avoid saturation

### Note map per line

| Line | Color   | Note | Oscillator |
| ---- | ------- | ---- | ---------- |
| L1   | #EF4135 | C4   | sine       |
| L2   | #F5A800 | E4   | triangle   |
| L3   | #A07850 | G4   | sine       |
| L4   | #1A6FAD | A4   | triangle   |
| L4A  | #1A6FAD | B4   | sine       |
| L5   | #00A651 | D5   | triangle   |
| L6   | #9B59B6 | F5   | sine       |

---

## Map: mapcn + MapLibre GL

### Setup

```bash
npx shadcn@latest add @mapcn/map
```

Installs `maplibre-gl` and adds `src/components/ui/map.tsx`.

### Map config

- Initial center: `[-70.6506, -33.4372]` (Santiago)
- Initial zoom: `11`
- Base style: CARTO Dark Matter (mapcn default dark)
- Disable all default UI controls

### GeoJSON layers (via `useMap()`)

**Lines layer** (static, loaded once):

```
type: "line"
paint: line-color from line data, line-width: 2, line-opacity: 0.6
```

**Stations layer** (static):

```
type: "circle"
paint: circle-radius: 3, circle-color: "#ffffff", circle-opacity: 0.4
```

**Trains layer** (dynamic, updated every frame):

```
type: "circle"
source: GeoJSON FeatureCollection via map.getSource().setData()
paint:
  circle-radius: 5
  circle-color: ["get", "color"]  ← data-driven from line color
  circle-opacity: 0.9
  circle-stroke-width: 1
  circle-stroke-color: "#ffffff"
```

**Arrival pings layer** (dynamic, short flash):

```
type: "circle"
paint: circle-radius expands via MapLibre expression, circle-opacity decays over time
```

### Animation loop

`requestAnimationFrame` inside `useEffect` in `TrainLayer.tsx`. Each frame:

1. Calculate interpolated position for all active trips
2. Detect station arrivals (distance < 30m)
3. Per new arrival: trigger audio note + add visual ping
4. Update trains source with `setData()`
5. Update pings source, drop entries older than 800ms

Use `requestAnimationFrame`, not `setInterval` — pauses automatically when tab is hidden.

---

## Performance notes

- `schedule.json` may exceed 10MB uncompressed. Vercel serves gzipped. Split by line if initial load is slow.
- `setData()` is efficient for frequent GeoJSON updates in MapLibre.
- Never use React components for individual trains — all train rendering goes through GeoJSON layers.
- Interpolator runs per-frame for all active trips. Use early-return for out-of-schedule trips if >200 simultaneous trips cause CPU pressure.

---

## UI

Minimal, inspired by El Organillero:

- Full-screen map, no chrome
- Bottom overlay: active train count, notes/minute, city name
- "Enter" button on load (required to initialize AudioContext)
- Monospace system font

---

## Environment variables

None required for MVP (CARTO tiles are free for non-commercial use).

Future:

```
NEXT_PUBLIC_MAPTILER_KEY=xxxx
```

---

## Commands

```bash
npm install
npm run process-gtfs   # requires scripts/gtfs/metro-santiago.zip
npm run dev
npm run build          # runs process-gtfs as prebuild
vercel --prod
```

`package.json` scripts:

```json
{
  "scripts": {
    "process-gtfs": "node scripts/process-gtfs.mjs",
    "prebuild": "npm run process-gtfs",
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

---

## Credits (UI colophon)

Display a colophon panel in the UI (toggleable, bottom of screen) with:

- Project name and short description
- Inspiration credits with links:
  - [El Organillero](https://organillero.heliouz.com/) by Helios Ocaña (CDMX)
  - [TrainJazz](https://www.trainjazz.com/) by Joshua Wolk
- Data source: Metro de Santiago / DTPM (GTFS)
- Map: [mapcn](https://mapcn.dev) + MapLibre GL + CARTO basemap

The colophon must be reachable via keyboard and screen reader (see Accessibility section).

---

## Internationalization (i18n)

The UI supports two languages: Spanish (`es`) and English (`en`). Spanish is the default.

### Approach

Use **next-intl** (`npm install next-intl`). No external translation service needed — all strings are static.

File structure:

```
messages/
  es.json    ← default
  en.json
```

Locale is stored in `localStorage` and applied on load. No URL-based routing change needed (single-page experience).

### Strings to translate

All visible UI text must go through `useTranslations()`. No hardcoded strings in components.

```json
// es.json
{
  "enter": "Entrar",
  "tagline": "Siete líneas. Siete voces.",
  "activeTrains": "{count} trenes activos",
  "notePerMin": "{count} notas/min",
  "languageToggle": "Switch to English",
  "colophon": {
    "title": "Metro Sonoro",
    "description": "Cada tren, al acercarse a una estación, toca una nota.",
    "inspiredBy": "Inspirado en",
    "dataSource": "Datos: Metro de Santiago / DTPM",
    "mapCredit": "Mapa: mapcn + MapLibre GL + CARTO"
  }
}

// en.json
{
  "enter": "Enter",
  "tagline": "Seven lines. Seven voices.",
  "activeTrains": "{count} active trains",
  "notePerMin": "{count} notes/min",
  "languageToggle": "Cambiar a español",
  "colophon": {
    "title": "Metro Sonoro",
    "description": "Each train plays a note as it approaches a station.",
    "inspiredBy": "Inspired by",
    "dataSource": "Data: Metro de Santiago / DTPM",
    "mapCredit": "Map: mapcn + MapLibre GL + CARTO"
  }
}
```

### Language toggle

Small button in the top-right corner. Clicking switches locale and persists to `localStorage`.

```tsx
<button onClick={toggleLocale} aria-label={t("languageToggle")}>
  {currentLocale === "es" ? "EN" : "ES"}
</button>
```

---

## Accessibility (a11y)

This is a visual + audio experience. Goal: users who cannot see or hear the map can still understand what the project is and access its content.

### Requirements

**Focus management**

- All interactive elements reachable via keyboard (`Tab` / `Shift+Tab`)
- Visible focus ring on all focusable elements — never remove `outline`; use `focus-visible:ring-2` via Tailwind
- "Enter" button is the first focusable element on load and receives focus automatically (`autoFocus`)

**Screen reader**

- Map canvas is decorative: `aria-hidden="true"` + `role="presentation"`
- Live region for arrivals: visually hidden `<div aria-live="polite" aria-atomic="false">` announces each arrival as `"{line} — {station}"`. Rate-limit to max 1 announcement/second to avoid flooding.
- Stats overlay uses `aria-label` with full readable text (e.g. `aria-label="42 active trains"`, not just `"42"`)
- Language toggle `aria-label` comes from translations (never just "EN" / "ES" as accessible name)
- Colophon links: no `target="_blank"` without `rel="noopener noreferrer"` and a visible external indicator

**Motion**

- Respect `prefers-reduced-motion`: disable ping expansion animation and reduce train movement to opacity pulse. Audio still plays normally.
- Check `window.matchMedia('(prefers-reduced-motion: reduce)')` once on mount; pass result as prop to animation layer.

**Color**

- Train dots distinguish lines by both color and size — never color alone
- Overlay text meets WCAG AA contrast (4.5:1) against the dark map background

**Semantic HTML**

- Enter screen: `<main>` landmark with `<h1>` for the project title
- Colophon: `<footer>` with `<nav aria-label="Credits">` wrapping links
- Language toggle: `<button>` — never `<div onClick>`
- Stats overlay: `<section aria-label="Live stats">`

### a11y checklist for Claude Code

Before marking a11y done, verify:

- [ ] Tab through entire UI without a mouse — all controls reachable and operable
- [ ] Run axe DevTools or `eslint-plugin-jsx-a11y` — zero violations
- [ ] Test with VoiceOver (macOS) or NVDA (Windows): map skipped, arrivals announced, colophon readable
- [ ] Toggle `prefers-reduced-motion` in DevTools — animations disabled, no layout shift
- [ ] Zoom browser to 200% — no content clipped or overlapping

---

## Out of scope for MVP

- No backend or API routes
- No auth
- No database
- No real-time data (all interpolated from static GTFS)
- No multi-city support (Madrid is Phase 3)
- No tests (add in Phase 2)

---

## Roadmap

**Phase 1 — MVP**
GTFS script → JSON → animated trains on map → audio → Vercel deploy

**Phase 2 — Polish**
City silhouette overlay, musical note tuning, mobile responsive UI, interpolator unit tests

**Phase 3 — Madrid**
Same codebase, new GTFS script for CRTM (Metro de Madrid, 13 lines).
Architecture is multi-city ready — only the input JSON and note map change.

---

## Madrid integration — pending tasks

`scripts/process-madrid.mjs` is written and tested. Output goes to `public/data/madrid/`.
`public/data/madrid/` is in `.gitignore` (not shipped in MVP).

The following tasks remain before Madrid is live in the app:

### 1. Multi-city architecture in the app

`MetroMap.tsx` currently hardcodes `/data/lines.json`. Needs refactoring:

- Add a `city` prop (or URL param `/madrid`) to `MetroMap`
- Fetch from `/data/{city}/lines.json`, `/data/{city}/stops.json`, `/data/{city}/schedule.json`
- Update map center + zoom per city: Madrid center `[-3.7038, 40.4168]`, zoom `11`
- Add city selector on the landing page or as a top-level route (`/` = Santiago, `/madrid` = Madrid)

### 2. Service ID mapping for Madrid

`src/lib/interpolator.ts` uses Santiago's service ID patterns (`L_D`, `L_V`, `S`, etc.).
Madrid uses `4_I12` (Sat), `4_I13` (Sun), `4_I14` (Mon–Thu), `4_I15` (Fri).

`activeServiceIds()` must become city-aware. Options:
- Pass a `serviceMap: Record<number, string[]>` param per city
- Or add Madrid's DOW→serviceId map directly:

```ts
// Madrid
const MADRID_SERVICE_BY_DOW: Record<number, string[]> = {
  0: ["4_I13"],                        // Sunday
  1: ["4_I14"], 2: ["4_I14"], 3: ["4_I14"], 4: ["4_I14"], // Mon–Thu
  5: ["4_I15"],                        // Friday
  6: ["4_I12"],                        // Saturday
};
```

### 3. Timezone

Madrid uses `Europe/Madrid` (CET/CEST). `santiagoNow()` needs a city-aware equivalent:
```ts
export function cityNow(timezone: string): { seconds: number; dow: number }
```
`Intl.DateTimeFormat` handles CET/CEST automatically — no extra work beyond passing the timezone.

### 4. Commit Madrid data

When ready to ship Madrid, remove `public/data/madrid/` from `.gitignore` and commit the generated JSON.
The 35MB `schedule.json` is within GitHub's limits (100MB hard cap).

### 5. Cercanías schedule data

The `metro-madrid-cercanias.zip` currently has no schedule (trips/stop_times empty).
Check CRTM's open data portal for an updated feed before implementing Cercanías animation.
