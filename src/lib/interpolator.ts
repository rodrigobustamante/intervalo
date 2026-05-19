import type { Trip, Stop } from "./gtfs-types";

// GTFS service_ids active per day of week
const SERVICE_BY_DOW: Record<number, string[]> = {
  0: ["D", "F"],     // Sunday
  1: ["L", "LJ"],    // Monday
  2: ["L", "LJ"],    // Tuesday
  3: ["L", "LJ"],    // Wednesday
  4: ["L", "LJ"],    // Thursday
  5: ["L", "V"],     // Friday
  6: ["S"],          // Saturday
};

export function santiagoNow(): { seconds: number; dow: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "narrow",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parseInt(parts.find((p) => p.type === type)!.value);
  const seconds = get("hour") * 3600 + get("minute") * 60 + get("second");

  // weekday: 0=Sun, 1=Mon, ..., 6=Sat via JS Date in Santiago timezone
  const localMidnight = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Santiago" })
  );
  const dow = localMidnight.getDay();

  return { seconds, dow };
}

export function activeServiceIds(dow: number): Set<string> {
  return new Set(SERVICE_BY_DOW[dow] ?? []);
}

export function interpolatePosition(
  trip: Trip,
  seconds: number
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
