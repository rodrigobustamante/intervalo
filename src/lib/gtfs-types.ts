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
  stopId: string;
  arrival: number;
  departure: number;
  coords: [number, number];
}

export interface Trip {
  tripId: string;
  lineId: string;
  serviceId: string;
  stopTimes: StopTime[];
}

export type Weekday = "L" | "LJ" | "V" | "S" | "D" | "F";
