const NOTE_FREQS: Record<string, number> = {
  B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63,
  F4: 349.23, G4: 392.0,  A4: 440.0,  B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
  G5: 784.0,
};

const LINE_NOTES: Record<string, { freq: number; type: OscillatorType }> = {
  // Santiago
  L1:  { freq: NOTE_FREQS.C4, type: "sine" },
  L2:  { freq: NOTE_FREQS.E4, type: "triangle" },
  L3:  { freq: NOTE_FREQS.G4, type: "sine" },
  L4:  { freq: NOTE_FREQS.A4, type: "triangle" },
  L4A: { freq: NOTE_FREQS.B4, type: "sine" },
  L5:  { freq: NOTE_FREQS.D5, type: "triangle" },
  L6:  { freq: NOTE_FREQS.F5, type: "sine" },
  // Madrid Metro
  M1:  { freq: NOTE_FREQS.C4, type: "sine" },
  M2:  { freq: NOTE_FREQS.D4, type: "triangle" },
  M4:  { freq: NOTE_FREQS.E4, type: "sine" },
  M5:  { freq: NOTE_FREQS.F4, type: "triangle" },
  M6:  { freq: NOTE_FREQS.G4, type: "sine" },
  M7:  { freq: NOTE_FREQS.A4, type: "triangle" },
  M8:  { freq: NOTE_FREQS.B4, type: "sine" },
  M9:  { freq: NOTE_FREQS.C5, type: "triangle" },
  M10: { freq: NOTE_FREQS.D5, type: "sine" },
  M11: { freq: NOTE_FREQS.E5, type: "triangle" },
  M12: { freq: NOTE_FREQS.G5, type: "sine" },
  MR:  { freq: NOTE_FREQS.B3, type: "sine" },
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeNotes = 0;
const MAX_NOTES = 4;

export function initAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}

// At Santiago lat -33°, zoom 9 ≈ 25 km/100px scale (above the 20 km threshold).
// Volume fades from 0 at zoom ≤ 9 to full at zoom ≥ 11.
export function setVolumeFromZoom(zoom: number): void {
  if (!masterGain || !ctx) return;
  const volume = Math.max(0, Math.min(1, (zoom - 9) / 2));
  // Smooth exponential approach over 0.4 s to avoid clicks
  masterGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.4);
}

export function playNote(lineId: string): void {
  if (!ctx || !masterGain || activeNotes >= MAX_NOTES) return;
  const note = LINE_NOTES[lineId];
  if (!note) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = note.type;
  osc.frequency.setValueAtTime(note.freq, now);

  // Envelope: attack 5ms, sustain, decay 200ms, release 100ms
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.005);
  gain.gain.setValueAtTime(0.3, now + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(gain);
  gain.connect(masterGain);

  activeNotes++;
  osc.start(now);
  osc.stop(now + 0.35);
  osc.onended = () => { activeNotes--; };
}
