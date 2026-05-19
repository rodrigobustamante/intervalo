const NOTE_FREQS: Record<string, number> = {
  C4: 261.63, E4: 329.63, G4: 392.0,
  A4: 440.0,  B4: 493.88, D5: 587.33, F5: 698.46,
};

const LINE_NOTES: Record<string, { freq: number; type: OscillatorType }> = {
  L1:  { freq: NOTE_FREQS.C4, type: "sine" },
  L2:  { freq: NOTE_FREQS.E4, type: "triangle" },
  L3:  { freq: NOTE_FREQS.G4, type: "sine" },
  L4:  { freq: NOTE_FREQS.A4, type: "triangle" },
  L4A: { freq: NOTE_FREQS.B4, type: "sine" },
  L5:  { freq: NOTE_FREQS.D5, type: "triangle" },
  L6:  { freq: NOTE_FREQS.F5, type: "sine" },
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
