import AdmZip from "adm-zip";
import { parse } from "csv-parse";
import { Readable } from "stream";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ZIP_PATH = resolve(__dirname, "gtfs/metro-santiago.zip");
const OUT_DIR = resolve(__dirname, "../public/data");

if (!existsSync(ZIP_PATH)) {
  console.log("metro-santiago.zip not found — skipping GTFS processing (using committed JSON).");
  process.exit(0);
}

// Note map per line (GTFS colors used)
const LINE_META = {
  L1:  { note: "C4", oscillatorType: "sine",     color: "#C8102E" },
  L2:  { note: "E4", oscillatorType: "triangle",  color: "#F2A900" },
  L3:  { note: "G4", oscillatorType: "sine",      color: "#703F2A" },
  L4:  { note: "A4", oscillatorType: "triangle",  color: "#151F6D" },
  L4A: { note: "B4", oscillatorType: "sine",      color: "#0072CE" },
  L5:  { note: "D5", oscillatorType: "triangle",  color: "#00965E" },
  L6:  { note: "F5", oscillatorType: "sine",      color: "#8E3A80" },
};

function nearestShapeIdx(coords, shape) {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const dx = coords[0] - shape[i][0], dy = coords[1] - shape[i][1];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
  }
  return bestIdx;
}

function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    parse(buffer, { columns: true, skip_empty_lines: true, trim: true }, (err, records) => {
      if (err) reject(err);
      else resolve(records);
    });
  });
}

function parseCsvStream(buffer) {
  return new Promise((resolve, reject) => {
    const records = [];
    Readable.from(buffer)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on("data", (r) => records.push(r))
      .on("error", reject)
      .on("end", () => resolve(records));
  });
}

function timeToSeconds(hhmmss) {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;

async function main() {
  console.log("Reading GTFS ZIP...");
  const zip = new AdmZip(ZIP_PATH);

  const read = (name) => zip.getEntry(name)?.getData();

  // ── Routes: filter Metro lines ──────────────────────────────────────────────
  const routes = await parseCsv(read("routes.txt"));
  const metroRoutes = routes.filter((r) => r.agency_id === "M");
  const metroRouteIds = new Set(metroRoutes.map((r) => r.route_id));
  console.log(`Metro routes: ${metroRoutes.map((r) => r.route_id).join(", ")}`);

  // ── Shapes: collect per route_id via trips ──────────────────────────────────
  const trips = await parseCsv(read("trips.txt"));
  const metroTrips = trips.filter((t) => metroRouteIds.has(t.route_id));

  // Load shapes; count points per shape_id to pick the most complete geometry
  const shapes = await parseCsvStream(read("shapes.txt"));
  const shapePointCount = new Map();
  for (const pt of shapes) {
    shapePointCount.set(pt.shape_id, (shapePointCount.get(pt.shape_id) ?? 0) + 1);
  }

  // One canonical shape per line: among direction_id=0 trips, pick shape with most points
  const canonicalShapeId = {};
  for (const t of metroTrips) {
    if (t.direction_id !== "0") continue;
    const existing = canonicalShapeId[t.route_id];
    if (!existing || (shapePointCount.get(t.shape_id) ?? 0) > (shapePointCount.get(existing) ?? 0)) {
      canonicalShapeId[t.route_id] = t.shape_id;
    }
  }
  for (const t of metroTrips) {
    if (!canonicalShapeId[t.route_id]) canonicalShapeId[t.route_id] = t.shape_id;
  }

  const canonicalSet = new Set(Object.values(canonicalShapeId));
  const shapePoints = {};
  for (const pt of shapes) {
    if (!canonicalSet.has(pt.shape_id)) continue;
    if (!shapePoints[pt.shape_id]) shapePoints[pt.shape_id] = [];
    shapePoints[pt.shape_id].push({
      seq: parseInt(pt.shape_pt_sequence),
      coords: [r5(parseFloat(pt.shape_pt_lon)), r5(parseFloat(pt.shape_pt_lat))],
    });
  }
  for (const id of Object.keys(shapePoints)) {
    shapePoints[id].sort((a, b) => a.seq - b.seq);
  }

  // ── lines.json ──────────────────────────────────────────────────────────────
  const lines = metroRoutes.map((r) => {
    const meta = LINE_META[r.route_id] ?? { note: "C4", oscillatorType: "sine", color: `#${r.route_color}` };
    const shapeId = canonicalShapeId[r.route_id];
    const shape = (shapePoints[shapeId] ?? []).map((p) => p.coords);
    return {
      id: r.route_id,
      name: r.route_long_name,
      color: meta.color,
      note: meta.note,
      oscillatorType: meta.oscillatorType,
      shape,
    };
  });

  // ── Stops: filter Metro, deduplicate by station (remove direction suffix) ───
  const allStops = await parseCsvStream(read("stops.txt"));

  // Metro boarding stops: format XX_LN_VN (location_type blank or "0")
  const metroStopPattern = /^[A-Z]+_L[0-9A]+_V[0-9]+$/;
  const boardingStops = allStops.filter(
    (s) => metroStopPattern.test(s.stop_id) && (s.location_type === "" || s.location_type === "0")
  );

  // Deduplicate: use the base station code (XX_LN) keeping first occurrence coords
  const stationMap = new Map();
  for (const s of boardingStops) {
    const parts = s.stop_id.split("_");
    const lineId = parts[1]; // e.g. L1
    const stationCode = parts[0]; // e.g. BA
    const canonicalId = `${stationCode}_${lineId}`;

    if (!stationMap.has(canonicalId)) {
      // Clean name: remove direction suffix ("Dirección ...")
      const cleanName = s.stop_name.replace(/\s+Dirección\s+.+$/, "").trim();
      stationMap.set(canonicalId, {
        id: canonicalId,
        name: cleanName,
        lineId,
        coords: [r5(parseFloat(s.stop_lon)), r5(parseFloat(s.stop_lat))],
      });
    }
  }
  const stops = Array.from(stationMap.values());
  console.log(`Metro stops (deduplicated): ${stops.length}`);

  const lineShapeMap = new Map(lines.map((l) => [l.id, l.shape]));

  // Build lookup: raw stop_id → canonical station id + coords
  const rawToCanonical = new Map();
  for (const s of boardingStops) {
    const parts = s.stop_id.split("_");
    const canonicalId = `${parts[0]}_${parts[1]}`;
    const stop = stationMap.get(canonicalId);
    if (stop) {
      rawToCanonical.set(s.stop_id, { canonicalId, coords: stop.coords });
    }
  }

  // Also build raw stop_id → coords directly for schedule
  const rawStopCoords = new Map();
  for (const s of boardingStops) {
    rawStopCoords.set(s.stop_id, [r5(parseFloat(s.stop_lon)), r5(parseFloat(s.stop_lat))]);
  }

  // ── schedule.json: stream stop_times ────────────────────────────────────────
  console.log("Processing stop_times (50MB, streaming)...");

  const metroTripIds = new Set(metroTrips.map((t) => t.trip_id));
  const tripMeta = new Map(
    metroTrips.map((t) => [t.trip_id, { lineId: t.route_id, serviceId: t.service_id }])
  );

  // Group stop_times by trip_id
  const tripStopTimes = new Map();
  const stopTimesData = read("stop_times.txt");
  const stopTimeRecords = await parseCsvStream(stopTimesData);

  const stopShapeIdxCache = new Map();
  for (const st of stopTimeRecords) {
    if (!metroTripIds.has(st.trip_id)) continue;
    if (!tripStopTimes.has(st.trip_id)) tripStopTimes.set(st.trip_id, []);
    const coords = rawStopCoords.get(st.stop_id);
    if (!coords) continue;

    let shapeIdx;
    if (stopShapeIdxCache.has(st.stop_id)) {
      shapeIdx = stopShapeIdxCache.get(st.stop_id);
    } else {
      const lineId = tripMeta.get(st.trip_id)?.lineId;
      const shape = lineShapeMap.get(lineId) ?? [];
      if (shape.length > 0) {
        shapeIdx = nearestShapeIdx(coords, shape);
        stopShapeIdxCache.set(st.stop_id, shapeIdx);
      }
    }

    const entry = {
      arrival: timeToSeconds(st.arrival_time),
      departure: timeToSeconds(st.departure_time),
      seq: parseInt(st.stop_sequence),
      coords,
    };
    if (shapeIdx !== undefined) entry.shapeIdx = shapeIdx;
    tripStopTimes.get(st.trip_id).push(entry);
  }

  const schedule = [];
  for (const [tripId, stopTimes] of tripStopTimes) {
    stopTimes.sort((a, b) => a.seq - b.seq);
    const meta = tripMeta.get(tripId);
    schedule.push({
      tripId,
      lineId: meta.lineId,
      serviceId: meta.serviceId,
      stopTimes: stopTimes.map(({ arrival, departure, coords, shapeIdx }) => {
        const entry = { arrival, departure, coords };
        if (shapeIdx !== undefined) entry.shapeIdx = shapeIdx;
        return entry;
      }),
    });
  }
  console.log(`Schedule trips: ${schedule.length}`);

  // ── Write output ─────────────────────────────────────────────────────────────
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/lines.json`, JSON.stringify(lines));
  writeFileSync(`${OUT_DIR}/stops.json`, JSON.stringify(stops));
  writeFileSync(`${OUT_DIR}/schedule.json`, JSON.stringify(schedule));

  const scheduleSize = JSON.stringify(schedule).length;
  console.log(`✓ lines.json    (${lines.length} lines)`);
  console.log(`✓ stops.json    (${stops.length} stops)`);
  console.log(`✓ schedule.json (${schedule.length} trips, ~${(scheduleSize / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
