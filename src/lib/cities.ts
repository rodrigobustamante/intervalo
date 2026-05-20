export type CityId = "santiago" | "madrid";

export interface CityConfig {
  id: CityId;
  timezone: string;
  center: [number, number];
  zoom: number;
  dataPath: string;
  serviceByDow: Record<number, string[]>;
}

export const CITIES: Record<CityId, CityConfig> = {
  santiago: {
    id: "santiago",
    timezone: "America/Santiago",
    center: [-70.6506, -33.4372],
    zoom: 11,
    dataPath: "/data",
    serviceByDow: {
      0: ["D", "F"],
      1: ["L", "LJ"],
      2: ["L", "LJ"],
      3: ["L", "LJ"],
      4: ["L", "LJ"],
      5: ["L", "V"],
      6: ["S"],
    },
  },
  madrid: {
    id: "madrid",
    timezone: "Europe/Madrid",
    center: [-3.7038, 40.4168],
    zoom: 11,
    dataPath: "/data/madrid",
    serviceByDow: {
      0: ["4_I13"],
      1: ["4_I14"],
      2: ["4_I14"],
      3: ["4_I14"],
      4: ["4_I14"],
      5: ["4_I15"],
      6: ["4_I12"],
    },
  },
};
