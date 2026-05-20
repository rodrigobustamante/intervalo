export type OscillatorType = "sine" | "triangle" | "square" | "sawtooth";

export interface Line {
  id: string;
  name: string;
  color: string;
  note: string;
  oscillatorType: OscillatorType;
  shape: [number, number][];
}

export interface Stop {
  id: string;
  name: string;
  lineId: string;
  coords: [number, number];
}

export interface StopTime {
  arrival: number;
  departure: number;
  coords: [number, number];
  shapeIdx?: number;
}

// Compact schedule format used by Madrid (templates + offsets instead of expanded trips)
export interface CompactStopTime {
  arrival: number;
  departure: number;
  coords: [number, number];
  shapeIdx?: number;
}

export interface TripTemplate {
  id: string;
  lineId: string;
  serviceId: string;
  stopTimes: CompactStopTime[];
}

export interface CompactSchedule {
  templates: TripTemplate[];
  index: [number, number][]; // [templateIndex, tripStart]
}

export interface Trip {
  tripId: string;
  lineId: string;
  serviceId: string;
  stopTimes: StopTime[];
}

export type Weekday = "L" | "LJ" | "V" | "S" | "D" | "F";
