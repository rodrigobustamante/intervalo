"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { type CityId } from "@/lib/cities";
import dynamic from "next/dynamic";
import { initAudio } from "@/lib/audio";

const MetroMap = dynamic(() => import("@/components/MetroMap"), { ssr: false });

export default function Home() {
  const { t, theme } = useI18n();
  const [city, setCity] = useState<CityId | null>(null);

  const handleEnter = (selectedCity: CityId) => {
    initAudio();
    setCity(selectedCity);
  };

  if (city) return <MetroMap city={city} />;

  const isDark = theme === "dark";
  const bg = isDark ? "bg-[#0a0a0a]" : "bg-[#f5f0e8]";
  const titleColor = isDark ? "text-white" : "text-black/80";
  const taglineColor = isDark ? "text-white/40" : "text-black/30";
  const btnClass = isDark
    ? "text-white border-white/30 hover:border-white hover:bg-white/5 focus-visible:ring-white"
    : "text-black/70 border-black/25 hover:border-black/60 hover:bg-black/5 focus-visible:ring-black";

  return (
    <main className={`flex items-center justify-center h-screen transition-colors duration-300 ${bg}`}>
      <div className="text-center space-y-6">
        <h1 className={`text-2xl font-mono tracking-widest uppercase ${titleColor}`}>
          Intervalo
        </h1>
        <p className={`text-sm font-mono tracking-wider ${taglineColor}`}>
          {t("tagline")}
        </p>
        <div className="flex gap-4 justify-center mt-8">
          <button
            autoFocus
            onClick={() => handleEnter("santiago")}
            className={`px-6 py-3 text-sm font-mono border focus-visible:ring-2 outline-none transition-all tracking-widest uppercase ${btnClass}`}
          >
            {t("cities.santiago")}
          </button>
          <button
            onClick={() => handleEnter("madrid")}
            className={`px-6 py-3 text-sm font-mono border focus-visible:ring-2 outline-none transition-all tracking-widest uppercase ${btnClass}`}
          >
            {t("cities.madrid")}
          </button>
        </div>
      </div>
    </main>
  );
}
