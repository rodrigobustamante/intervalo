"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Map, useMap } from "@/components/ui/map";
import type { MapViewport } from "@/components/ui/map";
import type { Line, Stop, Trip } from "@/lib/gtfs-types";
import {
  santiagoNow,
  activeServiceIds,
  interpolatePosition,
} from "@/lib/interpolator";
import { setVolumeFromZoom } from "@/lib/audio";
import { useI18n, type Theme } from "@/lib/i18n";
import TrainLayer from "./TrainLayer";
import StationPingLayer from "./StationPingLayer";

const SANTIAGO_CENTER: [number, number] = [-70.6506, -33.4372];
const INITIAL_ZOOM = 11;

// ── Static lines layer ──────────────────────────────────────────────────────

function LinesLayer({ lines }: { lines: Line[] }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!isLoaded || !map || lines.length === 0) return;

    const add = () => {
      for (const line of lines) {
        if (line.shape.length < 2) continue;
        const sourceId = `line-source-${line.id}`;
        const layerId = `line-layer-${line.id}`;
        if (map.getSource(sourceId)) continue;

        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: line.shape },
            properties: {},
          },
        });
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": line.color,
            "line-width": 2,
            "line-opacity": 0.6,
          },
        });
      }
    };

    if (map.isStyleLoaded()) add();
    else map.once("styledata", add);

    return () => {
      for (const line of lines) {
        try {
          const layerId = `line-layer-${line.id}`;
          const sourceId = `line-source-${line.id}`;
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        } catch { /* ignore */ }
      }
    };
  }, [isLoaded, map, lines]);

  return null;
}

// ── Stats overlay ───────────────────────────────────────────────────────────

interface StatsProps {
  activeCount: number;
  notesPerMin: number;
  lastAnnouncement: string;
  theme: Theme;
}

function StatsOverlay({ activeCount, notesPerMin, lastAnnouncement, theme }: StatsProps) {
  const { t } = useI18n();
  const activeLabel = t("activeTrains", { count: activeCount });
  const notesLabel = t("notePerMin", { count: notesPerMin });
  const textColor = theme === "dark" ? "text-white/60" : "text-black/60";
  const mutedColor = theme === "dark" ? "text-white/30" : "text-black/30";

  return (
    <>
      <section
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-6 text-xs font-mono pointer-events-none select-none ${textColor}`}
        aria-label="Live stats"
      >
        <span aria-label={activeLabel}>{activeLabel}</span>
        <span aria-label={notesLabel}>{notesLabel}</span>
        <span className={mutedColor}>Santiago</span>
      </section>

      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {lastAnnouncement}
      </div>
    </>
  );
}

// ── Colophon ────────────────────────────────────────────────────────────────

function Colophon({ open, onClose, theme }: { open: boolean; onClose: () => void; theme: Theme }) {
  const { t } = useI18n();
  if (!open) return null;

  const bg = theme === "dark" ? "bg-black/85 border-white/10 text-white/60" : "bg-white/90 border-black/10 text-black/60";
  const titleColor = theme === "dark" ? "text-white/90" : "text-black/90";
  const closeColor = theme === "dark" ? "text-white/40 hover:text-white focus-visible:ring-white" : "text-black/40 hover:text-black focus-visible:ring-black";
  const linkColor = theme === "dark" ? "text-white/80 hover:text-white" : "text-black/80 hover:text-black";

  return (
    <footer
      className={`absolute bottom-16 left-1/2 -translate-x-1/2 border p-4 text-xs font-mono max-w-xs w-full ${bg}`}
      role="dialog"
      aria-label={t("colophon.title")}
    >
      <button
        onClick={onClose}
        className={`absolute top-2 right-3 outline-none focus-visible:ring-2 ${closeColor}`}
        aria-label="×"
      >
        ×
      </button>
      <p className={`font-semibold mb-1 ${titleColor}`}>{t("colophon.title")}</p>
      <p className="mb-3">{t("colophon.description")}</p>
      <nav aria-label="Credits" className="space-y-1">
        <p>
          {t("colophon.inspiredBy")}{" "}
          <a href="https://organillero.heliouz.com/" rel="noopener noreferrer" className={`underline ${linkColor}`} target="_blank">El Organillero↗</a>{" "}
          (Helios Ocaña) y{" "}
          <a href="https://www.trainjazz.com/" rel="noopener noreferrer" className={`underline ${linkColor}`} target="_blank">TrainJazz↗</a>{" "}
          (Joshua Wolk)
        </p>
        <p>{t("colophon.dataSource")}</p>
        <p>
          {t("colophon.mapCredit").split("mapcn")[0]}
          <a href="https://mapcn.dev" rel="noopener noreferrer" className={`underline ${linkColor}`} target="_blank">mapcn↗</a>
          {t("colophon.mapCredit").split("mapcn")[1]}
        </p>
      </nav>
    </footer>
  );
}

// ── MetroMap ────────────────────────────────────────────────────────────────

export default function MetroMap() {
  const [lines, setLines] = useState<Line[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [schedule, setSchedule] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeCount, setActiveCount] = useState(0);
  const [notesPerMin, setNotesPerMin] = useState(0);
  const [lastAnnouncement, setLastAnnouncement] = useState("");
  const [colophonOpen, setColophonOpen] = useState(false);

  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const { t, theme } = useI18n();

  const notesInWindowRef = useRef<number[]>([]);
  const announceCooldownRef = useRef(0);

  useEffect(() => {
    Promise.all([
      fetch("/data/lines.json").then((r) => r.json()),
      fetch("/data/stops.json").then((r) => r.json()),
      fetch("/data/schedule.json").then((r) => r.json()),
    ]).then(([l, s, sc]) => {
      setLines(l);
      setStops(s);
      setSchedule(sc);
      setLoading(false);
    });
  }, []);

  // Update active train count every second
  useEffect(() => {
    if (schedule.length === 0) return;
    const interval = setInterval(() => {
      const { seconds, dow } = santiagoNow();
      const valid = activeServiceIds(dow);
      const count = schedule.filter(
        (trip) => valid.has(trip.serviceId) && interpolatePosition(trip, seconds) !== null
      ).length;
      setActiveCount(count);

      const now = performance.now();
      notesInWindowRef.current = notesInWindowRef.current.filter((ts) => now - ts < 60000);
      setNotesPerMin(notesInWindowRef.current.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [schedule]);

  const handleArrival = useCallback((lineId: string, stopName: string) => {
    notesInWindowRef.current.push(performance.now());
    const now = performance.now();
    if (now - announceCooldownRef.current > 1000) {
      announceCooldownRef.current = now;
      setLastAnnouncement(`${lineId} — ${stopName}`);
    }
  }, []);

  const handleViewportChange = useCallback((viewport: MapViewport) => {
    setVolumeFromZoom(viewport.zoom);
  }, []);

  const muted = theme === "dark" ? "text-white/30 hover:text-white/60 focus-visible:ring-white" : "text-black/30 hover:text-black/60 focus-visible:ring-black";

  return (
    <div className="relative w-full h-screen">
      <div role="presentation" aria-hidden="true" className="absolute inset-0">
        <Map
          theme={theme}
          center={SANTIAGO_CENTER}
          zoom={INITIAL_ZOOM}
          attributionControl={false}
          loading={loading}
          onViewportChange={handleViewportChange}
        >
          <LinesLayer lines={lines} />
          <StationPingLayer stops={stops} />
          <TrainLayer
            lines={lines}
            stops={stops}
            schedule={schedule}
            reducedMotion={reducedMotion}
            onArrival={handleArrival}
          />
        </Map>
      </div>

      <StatsOverlay
        activeCount={activeCount}
        notesPerMin={notesPerMin}
        lastAnnouncement={lastAnnouncement}
        theme={theme}
      />

      <button
        onClick={() => setColophonOpen((o) => !o)}
        className={`absolute bottom-6 right-6 text-xs font-mono outline-none focus-visible:ring-2 ${muted}`}
        aria-label={t("colophon.title")}
      >
        info
      </button>

      <Colophon open={colophonOpen} onClose={() => setColophonOpen(false)} theme={theme} />
    </div>
  );
}
