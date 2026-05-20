import AdmZip from "adm-zip";
import { parse } from "csv-parse";
import { Readable } from "stream";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRO_ZIP     = resolve(__dirname, "gtfs/metro-madrid.zip");
const CERCANIAS_ZIP = resolve(__dirname, "gtfs/metro-madrid-cercanias.zip");
const OUT_DIR       = resolve(__dirname, "../public/data/madrid");

if (!existsSync(METRO_ZIP)) {
  console.log("metro-madrid.zip not found — skipping GTFS processing (using committed JSON).");
  process.exit(0);
}

// ── Line metadata ────────────────────────────────────────────────────────────
// Colors from CRTM GTFS. Line 3 absent from this GTFS feed (no trips in data).

const METRO_META = {
  M1:  { color: "#2DBEF0", note: "C4",  oscillatorType: "sine"     },
  M2:  { color: "#ED1C24", note: "D4",  oscillatorType: "triangle" },
  M4:  { color: "#B65518", note: "E4",  oscillatorType: "sine"     },
  M5:  { color: "#8FD400", note: "F4",  oscillatorType: "triangle" },
  M6:  { color: "#98989B", note: "G4",  oscillatorType: "sine"     },
  M7:  { color: "#EE7518", note: "A4",  oscillatorType: "triangle" },
  M8:  { color: "#EC82B1", note: "B4",  oscillatorType: "sine"     },
  M9:  { color: "#A60084", note: "C5",  oscillatorType: "triangle" },
  M10: { color: "#005AA9", note: "D5",  oscillatorType: "sine"     },
  M11: { color: "#009B3A", note: "E5",  oscillatorType: "triangle" },
  M12: { color: "#A49800", note: "G5",  oscillatorType: "sine"     },
  MR:  { color: "#6699CC", note: "B3",  oscillatorType: "sine"     },
};

// Cercanías: stops shown on map only — schedule data absent from this GTFS feed.
const CERCANIAS_META = {
  C1:  { color: "#4FB0E5", note: "C3",  oscillatorType: "sawtooth" },
  C2:  { color: "#008B45", note: "D3",  oscillatorType: "sawtooth" },
  C3:  { color: "#9F2E86", note: "E3",  oscillatorType: "sawtooth" },
  C4A: { color: "#888888", note: "F3",  oscillatorType: "sawtooth" },
  C4B: { color: "#666666", note: "G3",  oscillatorType: "sawtooth" },
  C5:  { color: "#F9BA13", note: "A3",  oscillatorType: "sawtooth" },
  C7:  { color: "#ED1C24", note: "B3",  oscillatorType: "sawtooth" },
  C8:  { color: "#008B45", note: "C4",  oscillatorType: "sawtooth" },
  C9:  { color: "#F95900", note: "D4",  oscillatorType: "sawtooth" },
  C10: { color: "#90B70E", note: "E4",  oscillatorType: "sawtooth" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function routeToLineId(routeId) {
  const m = routeId.match(/^4__(\d+|R)___$/);
  if (m) return `M${m[1]}`;
  // C4A/C4B end with __ (two underscores); regular lines end with ___ (three)
  const c = routeId.match(/^5__C(\d+)(?:_([AB]))?_{2,3}$/);
  if (c) return `C${c[1]}${c[2] || ""}`;
  return routeId;
}

function nearestShapeIdx(coords, shape) {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const dx = coords[0] - shape[i][0], dy = coords[1] - shape[i][1];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
  }
  return bestIdx;
}

function toSec(hhmmss) {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;

function readZip(zip, name) {
  return zip.getEntry(name)?.getData() ?? null;
}

function parseCsv(buf) {
  if (!buf) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const records = [];
    const str = buf.toString("utf8").replace(/^﻿/, "");
    Readable.from(str)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on("data", (r) => records.push(r))
      .on("error", reject)
      .on("end", () => resolve(records));
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const metroZip     = new AdmZip(METRO_ZIP);
  const cercaniasZip = new AdmZip(CERCANIAS_ZIP);

  // ── Metro: routes ──────────────────────────────────────────────────────────
  const metroRoutes = await parseCsv(readZip(metroZip, "routes.txt"));
  console.log(`Metro routes: ${metroRoutes.map((r) => routeToLineId(r.route_id)).join(", ")}`);

  // ── Cercanías: routes ──────────────────────────────────────────────────────
  const cercaniasRoutes = await parseCsv(readZip(cercaniasZip, "routes.txt"));
  console.log(`Cercanías routes: ${cercaniasRoutes.map((r) => routeToLineId(r.route_id)).join(", ")}`);

  // ── Metro: shapes ──────────────────────────────────────────────────────────
  console.log("Processing Metro shapes...");
  const metroTripsRaw  = await parseCsv(readZip(metroZip, "trips.txt"));
  const metroTripRoute = Object.fromEntries(metroTripsRaw.map((t) => [t.trip_id, t.route_id]));

  // Collect all distinct shape_ids per route (direction=0 trips; fallback to any direction)
  const routeShapeIds = {};
  for (const t of metroTripsRaw) {
    if (t.direction_id !== "0") continue;
    if (!routeShapeIds[t.route_id]) routeShapeIds[t.route_id] = new Set();
    routeShapeIds[t.route_id].add(t.shape_id);
  }
  for (const t of metroTripsRaw) {
    if (!routeShapeIds[t.route_id]) routeShapeIds[t.route_id] = new Set([t.shape_id]);
  }

  // Load all needed shapes
  const allNeededShapes = new Set(Object.values(routeShapeIds).flatMap((s) => [...s]));
  const shapesRaw = await parseCsv(readZip(metroZip, "shapes.txt"));
  const shapeData = {};
  for (const pt of shapesRaw) {
    if (!allNeededShapes.has(pt.shape_id)) continue;
    if (!shapeData[pt.shape_id]) shapeData[pt.shape_id] = [];
    shapeData[pt.shape_id].push({
      seq: parseInt(pt.shape_pt_sequence),
      coords: [r5(parseFloat(pt.shape_pt_lon)), r5(parseFloat(pt.shape_pt_lat))],
    });
  }
  for (const id of Object.keys(shapeData)) {
    shapeData[id].sort((a, b) => a.seq - b.seq);
    shapeData[id] = shapeData[id].map((p) => p.coords);
  }

  // Chain multiple shape segments into one polyline per route (handles M9/M7/M10 branches).
  // Identifies "free" (non-shared) endpoints first to find true termini, then greedily appends.
  function dist2([x1, y1], [x2, y2]) { return (x1 - x2) ** 2 + (y1 - y2) ** 2; }

  function chainSegments(segs) {
    if (segs.length <= 1) return segs[0] ?? [];

    // Build endpoint list: {si, isFirst, coord}
    const eps = segs.flatMap((s, si) => [
      { si, isFirst: true,  coord: s[0] },
      { si, isFirst: false, coord: s[s.length - 1] },
    ]);

    // An endpoint is "free" (terminus) if no other segment has a nearby endpoint
    const SHARED = 1e-4; // ~100m in degree² — endpoints closer than this are a shared junction
    const isFree = (ep) => eps.every((o) => o.si === ep.si || dist2(ep.coord, o.coord) >= SHARED);
    const freeEps = eps.filter(isFree);

    // Orient the starting segment so its free endpoint comes first
    const fe = freeEps[0] ?? { si: 0, isFirst: true };
    const startReverse = !fe.isFirst;
    const result = startReverse ? [...segs[fe.si]].reverse() : [...segs[fe.si]];
    const remaining = segs.map((s, i) => s).filter((_, i) => i !== fe.si);

    while (remaining.length > 0) {
      const tail = result[result.length - 1];
      let bi = 0, bd = Infinity, brev = false;
      for (let i = 0; i < remaining.length; i++) {
        const d0 = dist2(tail, remaining[i][0]);
        const d1 = dist2(tail, remaining[i][remaining[i].length - 1]);
        if (d0 < bd) { bd = d0; bi = i; brev = false; }
        if (d1 < bd) { bd = d1; bi = i; brev = true; }
      }
      if (bd > 0.01) break; // >~1km gap — stop rather than draw a long straight line
      const seg = remaining.splice(bi, 1)[0];
      result.push(...(brev ? [...seg].reverse() : seg));
    }
    return result;
  }

  // Build per-route chained shape (used for both rendering and shapeIdx computation)
  const routeShape = {};
  for (const [routeId, shapeIds] of Object.entries(routeShapeIds)) {
    const segs = [...shapeIds].map((id) => shapeData[id]).filter(Boolean);
    routeShape[routeId] = segs.length > 0 ? chainSegments(segs) : [];
  }

  // ── lines.json ─────────────────────────────────────────────────────────────
  const metroLines = metroRoutes
    .filter((r) => routeShape[r.route_id]?.length > 0) // skip lines with no shape (e.g. M3 suspended)
    .map((r) => {
      const lineId = routeToLineId(r.route_id);
      const meta = METRO_META[lineId] ?? { color: `#${r.route_color}`, note: "C4", oscillatorType: "sine" };
      const shape = routeShape[r.route_id];
      return { id: lineId, name: r.route_long_name, color: meta.color, note: meta.note, oscillatorType: meta.oscillatorType, shape };
    });

  // Cercanías has no shape data — add route entries without shape for potential future use
  const cercaniasLines = cercaniasRoutes.map((r) => {
    const lineId = routeToLineId(r.route_id);
    const meta = CERCANIAS_META[lineId] ?? { color: `#${r.route_color}`, note: "C3", oscillatorType: "sawtooth" };
    return { id: lineId, name: r.route_long_name, color: meta.color, note: meta.note, oscillatorType: meta.oscillatorType, shape: [] };
  });

  const lines = [...metroLines, ...cercaniasLines];
  const lineShapeMap = new Map(metroLines.map((l) => [l.id, l.shape]));

  // ── stops.json ─────────────────────────────────────────────────────────────
  // Metro: par_ stops referenced in stop_times → derive lineId from trips
  const metroStopTimesRaw = await parseCsv(readZip(metroZip, "stop_times.txt"));
  const stopToLine = {};
  for (const st of metroStopTimesRaw) {
    const route = metroTripRoute[st.trip_id];
    if (route && !stopToLine[st.stop_id]) {
      stopToLine[st.stop_id] = routeToLineId(route);
    }
  }

  const metroStopsRaw  = await parseCsv(readZip(metroZip, "stops.txt"));
  const metroParStops  = metroStopsRaw.filter((s) => s.stop_id.startsWith("par_4_"));
  const metroStops = metroParStops
    .filter((s) => stopToLine[s.stop_id])
    .map((s) => ({
      id: s.stop_id,
      name: s.stop_name,
      lineId: stopToLine[s.stop_id],
      coords: [r5(parseFloat(s.stop_lon)), r5(parseFloat(s.stop_lat))],
    }));

  // Cercanías: par_ stops (stops only, no schedule)
  const cercaniasStopsRaw = await parseCsv(readZip(cercaniasZip, "stops.txt"));
  const cercaniasParStops = cercaniasStopsRaw.filter((s) => s.stop_id.startsWith("par_5_"));

  // Derive lineId for Cercanías stops from stop_code → find which routes use this stop
  // Since no stop_times exist, we mark all as C_UNKNOWN and skip for now.
  // (Cercanías stops are displayed on map but won't trigger audio.)
  const cercaniasStops = cercaniasParStops.map((s) => ({
    id: s.stop_id,
    name: s.stop_name,
    lineId: "C",
    coords: [r5(parseFloat(s.stop_lon)), r5(parseFloat(s.stop_lat))],
  }));

  const stops = [...metroStops, ...cercaniasStops];
  console.log(`Metro stops: ${metroStops.length} | Cercanías stops: ${cercaniasStops.length}`);

  // ── schedule.json: expand frequencies ─────────────────────────────────────
  console.log("Expanding Metro frequency-based schedule...");

  // Build stop_id → coords lookup
  const stopCoords = new Map(metroParStops.map((s) => [
    s.stop_id,
    [r5(parseFloat(s.stop_lon)), r5(parseFloat(s.stop_lat))],
  ]));

  // Pre-compute shapeIdx per stop_id (nearest point in line's canonical shape)
  const stopShapeIdxCache = new Map();
  for (const st of metroStopTimesRaw) {
    if (stopShapeIdxCache.has(st.stop_id)) continue;
    const coords = stopCoords.get(st.stop_id);
    if (!coords) continue;
    const lineId = routeToLineId(metroTripRoute[st.trip_id]);
    const shape = lineShapeMap.get(lineId) ?? [];
    if (shape.length > 0) stopShapeIdxCache.set(st.stop_id, nearestShapeIdx(coords, shape));
  }

  // Group stop_times by trip_id (already loaded above)
  const templateStopTimes = new Map();
  for (const st of metroStopTimesRaw) {
    if (!templateStopTimes.has(st.trip_id)) templateStopTimes.set(st.trip_id, []);
    const entry = {
      arrival: toSec(st.arrival_time),
      departure: toSec(st.departure_time),
      seq: parseInt(st.stop_sequence),
      coords: stopCoords.get(st.stop_id),
    };
    if (stopShapeIdxCache.has(st.stop_id)) entry.shapeIdx = stopShapeIdxCache.get(st.stop_id);
    templateStopTimes.get(st.trip_id).push(entry);
  }
  for (const times of templateStopTimes.values()) {
    times.sort((a, b) => a.seq - b.seq);
  }

  // Load trips metadata
  const metroTripSvc = Object.fromEntries(metroTripsRaw.map((t) => [t.trip_id, t.service_id]));

  // Build compact schedule: templates + index (no expanded trips stored)
  const freqsRaw = await parseCsv(readZip(metroZip, "frequencies.txt"));
  const freqsByTrip = new Map();
  for (const f of freqsRaw) {
    if (!freqsByTrip.has(f.trip_id)) freqsByTrip.set(f.trip_id, []);
    freqsByTrip.get(f.trip_id).push(f);
  }

  const templates = [];
  const index = []; // [templateIdx, tripStart] pairs

  for (const [templateTripId, template] of templateStopTimes) {
    const freqs = freqsByTrip.get(templateTripId);
    if (!freqs || freqs.length === 0) continue;

    const lineId = routeToLineId(metroTripRoute[templateTripId]);
    const serviceId = metroTripSvc[templateTripId];
    const refFirstStop = template[0].arrival;

    // Normalize times so first stop = 0; filter stops with missing coords
    const normalizedStops = template
      .filter((st) => st.coords)
      .map((st) => {
        const entry = {
          arrival: st.arrival - refFirstStop,
          departure: st.departure - refFirstStop,
          coords: st.coords,
        };
        if (st.shapeIdx !== undefined) entry.shapeIdx = st.shapeIdx;
        return entry;
      });

    if (normalizedStops.length < 2) continue;

    const tmplIdx = templates.length;
    templates.push({ id: templateTripId, lineId, serviceId, stopTimes: normalizedStops });

    for (const freq of freqs) {
      const windowStart = toSec(freq.start_time);
      const windowEnd   = toSec(freq.end_time);
      const headway     = parseInt(freq.headway_secs);
      for (let tripStart = windowStart; tripStart < windowEnd; tripStart += headway) {
        index.push([tmplIdx, tripStart]);
      }
    }
  }

  const schedule = { templates, index };
  console.log(`Templates: ${templates.length} | Expanded trips: ${index.length}`);

  // ── Write output ───────────────────────────────────────────────────────────
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/lines.json`,    JSON.stringify(lines));
  writeFileSync(`${OUT_DIR}/stops.json`,    JSON.stringify(stops));
  writeFileSync(`${OUT_DIR}/schedule.json`, JSON.stringify(schedule));

  console.log(`✓ lines.json    (${lines.length} lines: ${metroLines.length} Metro + ${cercaniasLines.length} Cercanías)`);
  console.log(`✓ stops.json    (${stops.length} stops)`);
  console.log(`✓ schedule.json (${templates.length} templates, ${index.length} trips, ~${(JSON.stringify(schedule).length / 1e6).toFixed(1)} MB)`);
  console.log("\nNote: Cercanías schedule data absent from this GTFS feed — stops shown on map only.");
  console.log("Note: Line 3 (M3) absent from this GTFS feed — likely suspended/under renovation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
