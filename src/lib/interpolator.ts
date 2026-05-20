import type { Trip, Stop } from "./gtfs-types";

// Walk along shape[fromIdx..toIdx] (forward or backward) at fraction t ∈ [0,1]
function lerpAlongPath(
  shape: [number, number][],
  fromIdx: number,
  toIdx: number,
  t: number
): [number, number] {
  if (fromIdx === toIdx) return shape[fromIdx];
  const step = fromIdx < toIdx ? 1 : -1;
  const pts: [number, number][] = [];
  for (let i = fromIdx; ; i += step) {
    pts.push(shape[i]);
    if (i === toIdx) break;
  }
  if (pts.length === 1) return pts[0];
  const dists = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = dists[dists.length - 1];
  if (total === 0) return pts[0];
  const target = t * total;
  for (let i = 1; i < pts.length; i++) {
    if (target <= dists[i]) {
      const st = (target - dists[i - 1]) / (dists[i] - dists[i - 1]);
      return [pts[i-1][0] + (pts[i][0] - pts[i-1][0]) * st, pts[i-1][1] + (pts[i][1] - pts[i-1][1]) * st];
    }
  }
  return pts[pts.length - 1];
}

export function cityNow(timezone: string): { seconds: number; dow: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "narrow",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parseInt(parts.find((p) => p.type === type)!.value);
  const seconds = get("hour") * 3600 + get("minute") * 60 + get("second");

  const localMidnight = new Date(
    now.toLocaleString("en-US", { timeZone: timezone })
  );
  const dow = localMidnight.getDay();

  return { seconds, dow };
}

export function activeServiceIds(
  dow: number,
  serviceByDow: Record<number, string[]>
): Set<string> {
  return new Set(serviceByDow[dow] ?? []);
}

export function interpolatePosition(
  trip: Trip,
  seconds: number,
  lineShapes?: Map<string, [number, number][]>
): [number, number] | null {
  const { stopTimes } = trip;
  if (stopTimes.length < 2) return null;

  const first = stopTimes[0];
  const last = stopTimes[stopTimes.length - 1];

  if (seconds < first.departure || seconds > last.arrival) return null;

  for (let i = 0; i < stopTimes.length - 1; i++) {
    const a = stopTimes[i];
    const b = stopTimes[i + 1];

    if (seconds >= a.departure && seconds < b.arrival) {
      const duration = b.arrival - a.departure;
      if (duration <= 0) return a.coords;
      const t = Math.max(0, Math.min(1, (seconds - a.departure) / duration));

      const shape = lineShapes?.get(trip.lineId);
      if (shape && a.shapeIdx !== undefined && b.shapeIdx !== undefined) {
        return lerpAlongPath(shape, a.shapeIdx, b.shapeIdx, t);
      }

      return [
        a.coords[0] + (b.coords[0] - a.coords[0]) * t,
        a.coords[1] + (b.coords[1] - a.coords[1]) * t,
      ];
    }
  }

  return null;
}

// Simplified Haversine — returns distance in meters
export function haversineMeters(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function detectArrival(
  pos: [number, number],
  stops: Stop[],
  thresholdMeters = 30
): Stop | null {
  for (const stop of stops) {
    if (haversineMeters(pos, stop.coords) <= thresholdMeters) return stop;
  }
  return null;
}
