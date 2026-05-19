"use client";

// Visual pings are managed imperatively by TrainLayer via MapLibre GeoJSON sources.
// This component adds the static stations layer (circles for each stop).

import { useEffect } from "react";
import { useMap } from "@/components/ui/map";
import type { Stop } from "@/lib/gtfs-types";
import type MapLibreGL from "maplibre-gl";

interface Props {
  stops: Stop[];
}

const STOPS_SOURCE = "stops-source";
const STOPS_LAYER = "stops-layer";

export default function StationPingLayer({ stops }: Props) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!isLoaded || !map || stops.length === 0) return;

    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: stops.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: s.coords },
        properties: { name: s.name, lineId: s.lineId },
      })),
    };

    const add = () => {
      if (map.getSource(STOPS_SOURCE)) return;
      map.addSource(STOPS_SOURCE, { type: "geojson", data });
      map.addLayer({
        id: STOPS_LAYER,
        type: "circle",
        source: STOPS_SOURCE,
        paint: {
          "circle-radius": 3,
          "circle-color": "#ffffff",
          "circle-opacity": 0.4,
        },
      });
    };

    if (map.isStyleLoaded()) add();
    else map.once("styledata", add);

    return () => {
      try {
        if (map.getLayer(STOPS_LAYER)) map.removeLayer(STOPS_LAYER);
        if (map.getSource(STOPS_SOURCE)) map.removeSource(STOPS_SOURCE);
      } catch { /* ignore */ }
    };
  }, [isLoaded, map, stops]);

  return null;
}
