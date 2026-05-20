"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@/components/ui/map";
import type { Line, Stop, Trip } from "@/lib/gtfs-types";
import {
  cityNow,
  activeServiceIds,
  interpolatePosition,
  detectArrival,
} from "@/lib/interpolator";
import { playNote } from "@/lib/audio";
import { CITIES, type CityId } from "@/lib/cities";
import type MapLibreGL from "maplibre-gl";

interface Props {
  lines: Line[];
  stops: Stop[];
  schedule: Trip[];
  reducedMotion: boolean;
  city: CityId;
  onArrival: (lineId: string, stopName: string) => void;
}

interface Ping {
  id: string;
  coords: [number, number];
  color: string;
  startedAt: number;
}

const PING_DURATION_MS = 800;
const TRAINS_SOURCE = "trains-source";
const TRAINS_LAYER = "trains-layer";
const PINGS_SOURCE = "pings-source";
const PINGS_LAYER = "pings-layer";

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export default function TrainLayer({
  lines,
  stops,
  schedule,
  reducedMotion,
  city,
  onArrival,
}: Props) {
  const { map, isLoaded } = useMap();

  const pingsRef = useRef<Ping[]>([]);
  const recentArrivalsRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number>(0);
  const lineColorMap = useRef<Map<string, string>>(new Map());
  const lineShapes = useRef<Map<string, [number, number][]>>(new Map());

  // Build line→color and line→shape lookups
  useEffect(() => {
    lines.forEach((l) => {
      lineColorMap.current.set(l.id, l.color);
      lineShapes.current.set(l.id, l.shape);
    });
  }, [lines]);

  // Initialize MapLibre layers
  useEffect(() => {
    if (!isLoaded || !map) return;

    const addLayers = () => {
      // Trains
      if (!map.getSource(TRAINS_SOURCE)) {
        map.addSource(TRAINS_SOURCE, { type: "geojson", data: emptyFC() });
        map.addLayer({
          id: TRAINS_LAYER,
          type: "circle",
          source: TRAINS_SOURCE,
          paint: {
            "circle-radius": 5,
            "circle-color": ["get", "color"],
            "circle-opacity": 0.9,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          },
        });
      }

      // Pings
      if (!map.getSource(PINGS_SOURCE)) {
        map.addSource(PINGS_SOURCE, { type: "geojson", data: emptyFC() });
        map.addLayer({
          id: PINGS_LAYER,
          type: "circle",
          source: PINGS_SOURCE,
          paint: {
            "circle-radius": ["get", "radius"],
            "circle-color": ["get", "color"],
            "circle-opacity": ["get", "opacity"],
            "circle-stroke-width": 0,
          },
        });
      }
    };

    // Some styles load async — retry if layers aren't ready yet
    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once("styledata", addLayers);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        if (map.getLayer(TRAINS_LAYER)) map.removeLayer(TRAINS_LAYER);
        if (map.getSource(TRAINS_SOURCE)) map.removeSource(TRAINS_SOURCE);
        if (map.getLayer(PINGS_LAYER)) map.removeLayer(PINGS_LAYER);
        if (map.getSource(PINGS_SOURCE)) map.removeSource(PINGS_SOURCE);
      } catch { /* ignore cleanup errors */ }
    };
  }, [isLoaded, map]);

  // Animation loop
  useEffect(() => {
    if (!isLoaded || !map || schedule.length === 0) return;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      const trainsSource = map.getSource(TRAINS_SOURCE) as MapLibreGL.GeoJSONSource | undefined;
      const pingsSource = map.getSource(PINGS_SOURCE) as MapLibreGL.GeoJSONSource | undefined;
      if (!trainsSource || !pingsSource) return;

      const cityConfig = CITIES[city];
      const { seconds, dow } = cityNow(cityConfig.timezone);
      const validServices = activeServiceIds(dow, cityConfig.serviceByDow);
      const now = performance.now();

      const trainFeatures: GeoJSON.Feature[] = [];
      const bounds = map.getBounds();

      for (const trip of schedule) {
        if (!validServices.has(trip.serviceId)) continue;

        const pos = interpolatePosition(trip, seconds, lineShapes.current);
        if (!pos) continue;

        const color = lineColorMap.current.get(trip.lineId) ?? "#ffffff";
        trainFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: pos },
          properties: { tripId: trip.tripId, lineId: trip.lineId, color },
        });

        // Arrival detection — deduplicate within 10s per trip+stop
        const arrived = detectArrival(pos, stops);
        if (arrived) {
          const key = `${trip.tripId}:${arrived.id}`;
          const last = recentArrivalsRef.current.get(key) ?? 0;
          if (now - last > 10000) {
            recentArrivalsRef.current.set(key, now);

            // Only play audio and show pings for trains visible in the viewport
            if (bounds.contains(pos as [number, number])) {
              playNote(trip.lineId);
              onArrival(trip.lineId, arrived.name);

              if (!reducedMotion) {
                pingsRef.current.push({
                  id: `${key}:${now}`,
                  coords: pos,
                  color,
                  startedAt: now,
                });
              }
            }
          }
        }
      }

      trainsSource.setData({ type: "FeatureCollection", features: trainFeatures });

      // Update pings — remove stale, compute radius/opacity
      pingsRef.current = pingsRef.current.filter(
        (p) => now - p.startedAt < PING_DURATION_MS
      );

      const pingFeatures: GeoJSON.Feature[] = pingsRef.current.map((p) => {
        const age = (now - p.startedAt) / PING_DURATION_MS; // 0→1
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: p.coords },
          properties: {
            color: p.color,
            radius: 5 + age * 25,
            opacity: Math.max(0, 0.6 * (1 - age)),
          },
        };
      });

      pingsSource.setData({ type: "FeatureCollection", features: pingFeatures });
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isLoaded, map, schedule, stops, reducedMotion, city, onArrival]);

  return null;
}
