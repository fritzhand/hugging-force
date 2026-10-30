/* The promo's soundtrack, synthesized here from code: no samples, no licensed music.

   An organ symphony in A minor that turns to A major on the end card, 120 BPM, one chord per shot
   (storyboard.mjs MUSIC). A pipe organ is built rank by rank: stopped flutes, principals, a gamba,
   mutations, a mixture and trumpets, each pipe with its own chiff and a little detuning, the C and
   C# sides of the case panned apart, and stops drawn as the cut builds. The great holds the chords,
   the swell plays an ostinato (eighths, then sixteenths), and the pedal reaches down to 32' on the
   end card. Around it: strings, a choir (formant-shaped), a clock that ticks faster as the camera
   dives, timpani on the shot changes with a roll into the end card, a low brass swell, cymbal
   swells, tubular bells on the cards and an organ chime on each family and arm beat, all in one
   long cathedral reverb (Freeverb with a pre-delay).

   The mix is measured as BS.1770 loudness, brought to MUSIC.lufs and limited below MUSIC.truePeak
   (measured 4x oversampled), and each stem's level is reported.

     node promo/score.mjs        writes promo/build/score.wav (48 kHz stereo, 32-bit float)
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FADES, MUSIC, SECONDS } from "./storyboard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCORE = path.join(HERE, "build", "score.wav");

const SR = 48000;
const N = Math.round(SECONDS * SR);
const BEAT = 60 / MUSIC.bpm;

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const dB = (d) => 10 ** (d / 20);
const at = (t) => Math.round(t * SR);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

/** Deterministic noise (mulberry32), so every render is the same. */
function noise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Equal-power pan, -1 (left) to 1 (right). */
const pan = (p) => [Math.cos(((clamp(p, -1, 1) + 1) * Math.PI) / 4), Math.sin(((clamp(p, -1, 1) + 1) * Math.PI) / 4)];

/** Linear interpolation through [time, value] keys. */
function line(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
      }
    }
    return keys[keys.length - 1][1];
  };
}

/* ---------- Harmony ---------- */

// A minor, VI, III, VII (suspended, then resolved), iv, V (suspended, then with its seventh) and A
// major on the end card. `pedal` is the pedal's 8' pitch; `great` the organ's held chord; `strings`
// the violins (the cellos double the pedal); `choir` the voices; `ost` the swell's ostinato notes.
const HARMONY = [
  { at: 0, name: "Am(add9)", pedal: 45, great: [57, 60, 64, 71], strings: [69, 72, 76], choir: [57, 64, 69], ost: [57, 60, 64, 69, 71, 72] },
  { at: 5, name: "Fmaj7(#11)", pedal: 41, great: [53, 57, 60, 64, 71], strings: [69, 72, 76], choir: [57, 60, 65], ost: [53, 57, 60, 64, 65, 71] },
  { at: 10, name: "C(add9)/E", pedal: 40, great: [55, 60, 62, 64, 67], strings: [67, 72, 74, 76], choir: [55, 60, 64], ost: [52, 55, 60, 62, 64, 67] },
  { at: 15.5, name: "Gsus4", pedal: 43, great: [55, 60, 62, 67], strings: [67, 72, 74, 79], choir: [55, 60, 62], ost: [55, 60, 62, 67, 72, 74] },
  { at: 18.25, name: "G", pedal: 43, great: [55, 59, 62, 67], strings: [67, 71, 74, 79], choir: [55, 59, 62], ost: [55, 59, 62, 67, 71, 74] },
  { at: 20.5, name: "Dm9", pedal: 38, great: [53, 57, 60, 64, 69], strings: [65, 69, 72, 76], choir: [57, 60, 65], ost: [50, 53, 57, 60, 64, 69] },
  { at: 23.6, name: "E7sus4", pedal: 40, great: [52, 57, 59, 62, 64], strings: [69, 71, 74, 76], choir: [57, 59, 64], ost: [52, 57, 59, 62, 64, 69] },
  { at: 24.6, name: "E7", pedal: 40, great: [52, 56, 59, 62, 64], strings: [68, 71, 74, 76], choir: [56, 59, 64], ost: [52, 56, 59, 62, 64, 68] },
  { at: 25.5, name: "A", pedal: 45, great: [57, 61, 64, 69, 73], strings: [69, 73, 76, 81], choir: [57, 61, 64, 69], ost: [] },
];
for (const t of MUSIC.chords) if (!HARMONY.some((h) => h.at === t)) throw new Error(`score: no chord at ${t} s (storyboard MUSIC.chords)`);
const chordAt = (t) => [...HARMONY].reverse().find((h) => h.at <= t + 1e-9);
const endOf = (k) => (k + 1 < HARMONY.length ? HARMONY[k + 1].at : SECONDS);
/** The organ's final chord is released here; the cathedral carries it to the end. */
const RELEASE = 28.3;

/**
 * Held notes for one voice of the harmony: a note common to two chords is held through, not
 * struck again, as an organist would. Returns [{ midi, from, to }].
 */
function held(part, last = RELEASE) {
  const notes = [];
  const open = new Map();
  HARMONY.forEach((h, k) => {
    const now = new Set([].concat(h[part]));
    for (const [m, n] of open) {
      if (!now.has(m)) {
        n.to = h.at;
        open.delete(m);
      }
    }
    for (const m of now) {
      if (!open.has(m)) {
        const n = { midi: m, from: h.at, to: endOf(k) };
        notes.push(n);
        open.set(m, n);
      }
    }
  });
  for (const n of open.values()) n.to = last;
  return notes;
}

/** Each accent's note: rising chord tones, four over the families, four over the arms. */
const ACCENT_NOTES = [74, 79, 83, 86, 81, 86, 88, 93];
if (ACCENT_NOTES.length !== MUSIC.accents.length) throw new Error("score: one accent note per MUSIC.accents entry");

/* ---------- Stems, each with its reverb send ---------- */

const bus = () => [new Float32Array(N), new Float32Array(N)];
const STEMS = {
  great: { send: 0.55 },
  swell: { send: 0.5 },
  pedal: { send: 0.25 },
  chimes: { send: 0.6 },
  strings: { send: 0.4 },
  choir: { send: 0.6 },
  brass: { send: 0.35 },
  timpani: { send: 0.35 },
  ticks: { send: 0.15 },
  cymbals: { send: 0.3 },
  bells: { send: 0.7 },
  aether: { send: 0.3 },
};
for (const s of Object.values(STEMS)) s.bus = bus();
const stem = (name) => STEMS[name].bus;

/* ---------- Building blocks ---------- */

function polyblep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Andrew Simper's state-variable filter (trapezoidal): low, band and high from one state. */
function svf() {
  let ic1 = 0;
  let ic2 = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  let k = 1;
  const out = { low: 0, band: 0, high: 0 };
  return {
    set(fc, q) {
      const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR);
      k = 1 / q;
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    },
    run(v0) {
      const v3 = v0 - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      out.low = v2;
      out.band = v1;
      out.high = v0 - k * v1 - v2;
      return out;
    },
  };
}

/** Writes a mono voice into a stem from `t0` for `len` seconds; `voice` gets the time since t0. */
function place(target, t0, len, gain, p, voice) {
  const [l, r] = pan(p);
  const start = at(t0);
  const s0 = Math.max(0, start);
  const s1 = Math.min(N, at(t0 + len));
  for (let i = s0; i < s1; i++) {
    const v = voice((i - start) / SR) * gain;
    target[0][i] += v * l;
    target[1][i] += v * r;
  }
}

/* ---------- The organ ---------- */

// Each pipe family's harmonic spectrum (amplitudes of harmonics 1, 2, 3...).
const SPECTRA = {
  // Stopped flute (Bourdon, Gedackt): the odd harmonics, soft and round.
  stopped: [1, 0.03, 0.3, 0.02, 0.12, 0.015, 0.05, 0.01, 0.02],
  // Open flute: a strong fundamental, a little octave.
  flute: [1, 0.25, 0.1, 0.05, 0.03, 0.02],
  // Principal (Diapason): the organ's own tone.
  principal: [1, 0.55, 0.42, 0.28, 0.22, 0.15, 0.12, 0.08, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02],
  // Gamba: thin and bright, like bowed strings.
  string: [0.7, 0.75, 0.7, 0.6, 0.55, 0.48, 0.42, 0.36, 0.32, 0.27, 0.23, 0.2, 0.17, 0.15, 0.13, 0.11, 0.09, 0.08, 0.07, 0.06],
  // Trumpet: a reed, brassy, its strongest harmonics above the fundamental.
  reed: [0.55, 0.85, 1, 0.9, 0.75, 0.6, 0.5, 0.42, 0.35, 0.3, 0.25, 0.21, 0.18, 0.15, 0.13, 0.11, 0.09, 0.08, 0.07, 0.06, 0.05, 0.045, 0.04, 0.035, 0.03],
};
const TABLE = 4096;
const tables = new Map();
/** One period of a pipe's tone with at most `n` harmonics (so no harmonic passes Nyquist), peak 1. */
function table(type, n) {
  const id = `${type}:${n}`;
  if (tables.has(id)) return tables.get(id);
  const amps = SPECTRA[type].slice(0, Math.max(1, n));
  const rnd = noise(type.length * 97 + 13);
  const phases = amps.map(() => rnd() * Math.PI);
  const t = new Float32Array(TABLE + 1);
  let peak = 0;
  for (let i = 0; i < TABLE; i++) {
    let v = 0;
    for (let h = 0; h < amps.length; h++) v += amps[h] * Math.sin((2 * Math.PI * (h + 1) * i) / TABLE + phases[h]);
    t[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < TABLE; i++) t[i] /= peak;
  t[TABLE] = t[0];
  tables.set(id, t);
  return t;
}

// The stops: a pipe family and its pitch against the key's 8' pitch (16' is 0.5, 2 2/3' is 3...).
const STOPS = {
  bourdon32: { pipe: "stopped", mult: 0.25 },
  bourdon16: { pipe: "stopped", mult: 0.5 },
  bourdon8: { pipe: "stopped", mult: 1 },
  principal8: { pipe: "principal", mult: 1 },
  gamba8: { pipe: "string", mult: 1, cents: 4 },
  octave4: { pipe: "principal", mult: 2 },
  flute4: { pipe: "flute", mult: 2 },
  twelfth: { pipe: "principal", mult: 3 },
  fifteenth: { pipe: "principal", mult: 4 },
  tierce: { pipe: "principal", mult: 5 },
  mixture: { pipe: "principal", mult: 8 },
  trumpet16: { pipe: "reed", mult: 0.5 },
  trumpet8: { pipe: "reed", mult: 1 },
};

// Registration: how far each stop is drawn over the cut, per division. The organ builds with the
// cut: flutes under the title, principals from the galaxy, mutations and the mixture into the
// overview, trumpets and the 32' on the end card.
const REGISTRATION = {
  great: {
    bourdon8: line([[0, 0.55], [25.5, 0.62]]),
    principal8: line([[0, 0], [4.9, 0], [5.1, 0.42], [10, 0.5], [25.5, 0.7]]),
    octave4: line([[0, 0], [9.9, 0], [10.1, 0.3], [20.5, 0.38], [25.5, 0.55]]),
    twelfth: line([[0, 0], [15.4, 0], [15.6, 0.14], [25.5, 0.26]]),
    fifteenth: line([[0, 0], [15.4, 0], [15.6, 0.16], [25.5, 0.3]]),
    tierce: line([[0, 0], [20.4, 0], [20.6, 0.08], [25.5, 0.14]]),
    mixture: line([[0, 0], [22, 0], [25.3, 0.05], [25.5, 0.24]]),
    trumpet8: line([[0, 0], [23.5, 0], [25.3, 0.08], [25.5, 0.45]]),
  },
  swell: {
    flute4: line([[0, 0.55]]),
    bourdon8: line([[0, 0.45]]),
    gamba8: line([[0, 0], [9.9, 0], [10.1, 0.3], [25.5, 0.4]]),
    principal8: line([[0, 0], [15.4, 0], [15.6, 0.25], [25.5, 0.35]]),
    fifteenth: line([[0, 0], [20.4, 0], [20.6, 0.1]]),
  },
  pedal: {
    bourdon16: line([[0, 0.75]]),
    principal8: line([[0, 0], [4.9, 0], [5.1, 0.4], [25.5, 0.55]]),
    octave4: line([[0, 0], [20.4, 0], [20.6, 0.22], [25.5, 0.32]]),
    trumpet16: line([[0, 0], [25.3, 0], [25.5, 0.28]]),
    bourdon32: line([[0, 0], [25.3, 0], [25.5, 0.55]]),
  },
  chimes: {
    principal8: line([[0, 0.35]]),
    octave4: line([[0, 0.4]]),
    fifteenth: line([[0, 0.35]]),
    mixture: line([[0, 0.15]]),
  },
};

/** The swell box: the ostinato grows from soft to full. */
const SWELL_BOX = line([[0, 0.55], [5, 0.55], [15.5, 0.75], [20.5, 0.85], [23.6, 0.9], [25.4, 0.8], [25.5, 1]]);

let pipeSeed = 1;
/**
 * One organ note, `midi` held from `from` to `to`, on every stop the division draws: each pipe
 * speaks with a short chiff (low pipes more slowly), detuned a little from its neighbors, and
 * sounds from its side of the case (C side left, C# side right).
 */
function organ(division, midi, from, to, { gain = 1, width = 0.35, expression = () => 1 } = {}) {
  const target = stem(division === "chimes" ? "chimes" : division);
  const reg = REGISTRATION[division];
  const side = midi % 2 === 0 ? -1 : 1;
  const [l, r] = pan(side * width);
  const rnd = noise(pipeSeed++ * 7919);
  for (const [name, drawn] of Object.entries(reg)) {
    // Skip a stop that is never drawn while the key is down.
    let used = false;
    for (let t = from; t <= to; t += 0.1) if (drawn(t) > 0) used = true;
    if (!used) continue;
    const stop = STOPS[name];
    const f = hz(midi) * stop.mult * 2 ** (((stop.cents ?? 0) + rnd() * 1.5) / 1200);
    if (f < 16 || f > 9000) continue;
    const wave = table(stop.pipe, Math.floor(19000 / f));
    const attack = clamp(0.012 + 3 / f, 0.012, 0.12);
    const release = clamp(0.05 + 6 / f, 0.06, 0.25);
    const chiffs = stop.pipe !== "reed" && f > 150;
    const chiffNoise = noise(pipeSeed * 31 + name.length);
    const bp = svf();
    bp.set(Math.min(f * 2.5, 9000), 4);
    let phase = rnd() * 0.5 + 0.5;
    const s0 = Math.max(0, at(from));
    const s1 = Math.min(N, at(to + release * 4));
    let g = 0;
    let e = 1;
    for (let i = s0; i < s1; i++) {
      const t = i / SR;
      if ((i - s0) % 64 === 0) {
        g = drawn(Math.min(t, to)) * expression(t) * gain;
      }
      const since = t - from;
      const env = since < attack ? 0.5 - 0.5 * Math.cos((Math.PI * since) / attack) : t <= to ? 1 : Math.exp(-(t - to) / (release / 3));
      phase += f / SR;
      if (phase >= 1) phase -= 1;
      const x = phase * TABLE;
      const j = x | 0;
      let v = wave[j] + (wave[j + 1] - wave[j]) * (x - j);
      if (chiffs && since < 0.12) {
        e = Math.exp(-since / (f < 400 ? 0.04 : 0.022));
        v += bp.run(chiffNoise()).band * 0.35 * e;
      }
      v *= env * g;
      target[0][i] += v * l;
      target[1][i] += v * r;
    }
  }
}

/** A fade from silence at the start (the organ under the title swells in). */
const OPENING = (t) => smooth(0, 2.6, t);

// The great holds the chords, a little fuller from the end card's downbeat.
const TUTTI = (t) => OPENING(t) * (1 + 0.15 * smooth(25.45, 25.55, t));
for (const n of held("great")) organ("great", n.midi, n.from, n.to, { gain: 0.11, expression: TUTTI });

// The pedal holds the roots.
for (const n of held("pedal")) organ("pedal", n.midi, n.from, n.to, { gain: 0.16, width: 0.15, expression: OPENING });

// The swell's ostinato: eighths from the first impact, an octave doubling from the tree shot,
// sixteenths over the overview, a beat of rest before each swell lands.
{
  const [p0, p1] = MUSIC.pulse;
  const EIGHTHS = [0, 2, 4, 2, 1, 3, 5, 3];
  const SIXTEENTHS = [0, 2, 4, 5, 4, 2, 1, 3, 5, 3, 1, 2, 4, 5, 4, 2];
  const rests = MUSIC.risers.map((t) => [t - BEAT, t]);
  const fast = MUSIC.chords[4];
  let k = 0;
  for (let t0 = p0; t0 < p1 - 1e-9; k++) {
    const step = t0 >= fast - 1e-9 ? BEAT / 4 : BEAT / 2;
    const resting = rests.some(([a, b]) => t0 >= a - 1e-9 && t0 < b - 1e-9);
    const notes = chordAt(t0).ost;
    if (!resting && notes.length) {
      const pattern = step < BEAT / 2 ? SIXTEENTHS : EIGHTHS;
      const m = notes[pattern[k % pattern.length] % notes.length];
      const accent = (step < BEAT / 2 ? k % 4 === 0 : k % 2 === 0) ? 1 : 0.8;
      organ("swell", m, t0, t0 + step * 0.9, { gain: 0.2 * accent, width: 0.45, expression: SWELL_BOX });
      if (t0 >= MUSIC.chords[3] - 1e-9 && k % 2 === 1) organ("swell", m + 12, t0, t0 + step * 0.9, { gain: 0.1, width: 0.55, expression: SWELL_BOX });
    }
    t0 = +(t0 + step).toFixed(6);
  }
}

// A chime on each family and arm beat.
// Softer over the arms, where the organ is already building to the end card.
MUSIC.accents.forEach((t0, n) => organ("chimes", ACCENT_NOTES[n], t0, t0 + 0.42, { gain: n < 4 ? 0.17 : 0.12, width: 0.5 }));

/* ---------- Strings ---------- */

{
  const target = stem("strings");
  const dynamic = line([[0, 0], [1.5, 0.3], [5, 0.5], [10, 0.6], [15.5, 0.7], [20.5, 0.8], [25.5, 1], [28.5, 0.9]]);
  const parts = [...held("strings").map((n) => ({ ...n, cello: false })), ...held("pedal").map((n) => ({ ...n, cello: true }))];
  parts.forEach((n, idx) => {
    const p = n.cello ? 0.4 : -0.6 + 1.2 * (((n.midi - 64) / 18 + 1) / 2);
    const len = n.to - n.from;
    [-7, 0, 7].forEach((cents, v) => {
      const f = hz(n.midi) * 2 ** (cents / 1200);
      const dt = f / SR;
      let ph = (idx * 0.31 + v * 0.17) % 1;
      const rate = 5.0 + v * 0.35 + (idx % 3) * 0.1;
      place(target, n.from - 0.15, len + 1.6, n.cello ? 0.044 : 0.036, p + (v - 1) * 0.15, (t) => {
        const vib = 1 + (8 / 1200) * Math.LN2 * Math.sin(2 * Math.PI * rate * t) * smooth(0.3, 1.1, t);
        ph += dt * vib;
        if (ph >= 1) ph -= 1;
        const s = 2 * ph - 1 - polyblep(ph, dt);
        const a = smooth(0, 1.2, t) * (t > len ? Math.exp(-(t - len) / 0.45) : 1);
        return s * a * dynamic(n.from + t);
      });
    });
  });
  // Bowed strings are darker played softly: the filter opens with the dynamic.
  for (const ch of [0, 1]) {
    const f = svf();
    const x = target[ch];
    for (let i = 0; i < N; i++) {
      if (i % 64 === 0) f.set(1600 + 3400 * dynamic(i / SR), 0.7);
      x[i] = f.run(x[i]).low;
    }
  }
}

/* ---------- Choir ("ah") ---------- */

{
  const target = stem("choir");
  const dynamic = line([[0, 0], [9.6, 0], [10.5, 0.35], [15.5, 0.5], [20.5, 0.7], [25.5, 1], [28.5, 0.85]]);
  for (const n of held("choir")) {
    if (n.to < 9.6) continue;
    const from = Math.max(n.from, 9.6);
    const len = n.to - from;
    [-6, 0, 6].forEach((cents, v) => {
      const f = hz(n.midi) * 2 ** (cents / 1200);
      const dt = f / SR;
      let ph = (v * 0.37 + n.midi * 0.11) % 1;
      const rate = 4.6 + v * 0.4;
      place(target, from - 0.2, len + 2, 0.08, (v - 1) * 0.5, (t) => {
        const vib = 1 + (12 / 1200) * Math.LN2 * Math.sin(2 * Math.PI * rate * t + v) * smooth(0.4, 1.4, t);
        ph += dt * vib;
        if (ph >= 1) ph -= 1;
        const s = 2 * ph - 1 - polyblep(ph, dt);
        const a = smooth(0, 1.0, t) * (t > len ? Math.exp(-(t - len) / 0.5) : 1);
        return s * a * dynamic(from + t);
      });
    });
  }
  // The vowel: three formants of an open "ah".
  for (const ch of [0, 1]) {
    const formants = [
      [800, 8, 1],
      [1150, 10, 0.6],
      [2900, 14, 0.25],
    ].map(([fc, q, g]) => {
      const f = svf();
      f.set(fc, q);
      return { f, g: g / q };
    });
    const x = target[ch];
    for (let i = 0; i < N; i++) {
      let y = 0;
      for (const { f, g } of formants) y += f.run(x[i]).band * g;
      x[i] = y * 2.2;
    }
  }
}

/* ---------- Low brass, swelling into the end card ---------- */

{
  const target = stem("brass");
  const swell = line([[0, 0], [20.5, 0], [22.5, 0.25], [25.4, 0.6], [25.5, 1], [27.5, 0.85], [28.6, 0]]);
  const NOTES = [
    { midi: 50, from: 20.5, to: 23.6 },
    { midi: 57, from: 20.5, to: 23.6 },
    { midi: 52, from: 23.6, to: 25.5 },
    { midi: 59, from: 23.6, to: 25.5 },
    { midi: 45, from: 25.5, to: 28.3 },
    { midi: 52, from: 25.5, to: 28.3 },
    { midi: 57, from: 25.5, to: 28.3 },
  ];
  NOTES.forEach((n, idx) => {
    const len = n.to - n.from;
    [-5, 0, 5].forEach((cents, v) => {
      const f = hz(n.midi) * 2 ** (cents / 1200);
      const dt = f / SR;
      let ph = (idx * 0.23 + v * 0.41) % 1;
      place(target, n.from, len + 1, 0.05, (v - 1) * 0.35, (t) => {
        ph += dt;
        if (ph >= 1) ph -= 1;
        const s = 2 * ph - 1 - polyblep(ph, dt);
        return s * smooth(0, 0.25, t) * (t > len ? Math.exp(-(t - len) / 0.3) : 1);
      });
    });
  });
  // Brass brightens as it gets louder.
  for (const ch of [0, 1]) {
    const f = svf();
    const x = target[ch];
    for (let i = 0; i < N; i++) {
      const s = swell(i / SR);
      if (i % 64 === 0) f.set(300 + 2400 * s * s, 0.9);
      x[i] = f.run(x[i]).low * s;
    }
  }
}

/* ---------- Timpani: the shot changes, a roll into the end card ---------- */

/** A timpani stroke: the drum's inharmonic modes, the pitch settling after the strike, and the mallet. */
function timpani(t0, midi, vel, seed) {
  const f0 = hz(midi);
  const RATIOS = [1, 1.5, 1.98, 2.44, 2.9, 3.38];
  const AMPS = [1, 0.6, 0.38, 0.26, 0.16, 0.1];
  const DECAYS = [1.8, 1.2, 0.9, 0.7, 0.55, 0.45].map((d) => d * (0.6 + 0.4 * vel));
  const phases = RATIOS.map(() => 0);
  const rnd = noise(seed);
  const mallet = svf();
  mallet.set(1500, 0.7);
  place(stem("timpani"), t0, 3.5, 0.18 * vel, 0.1, (t) => {
    const bend = 1 + 0.02 * Math.exp(-t / 0.08);
    let v = 0;
    for (let k = 0; k < RATIOS.length; k++) {
      phases[k] += (f0 * RATIOS[k] * bend) / SR;
      v += AMPS[k] * Math.sin(2 * Math.PI * phases[k]) * Math.exp(-t / DECAYS[k]);
    }
    return (v + mallet.run(rnd()).low * 1.5 * Math.exp(-t / 0.012)) * Math.min(1, t / 0.002);
  });
}

{
  const PITCH = { 5: 41, 10: 40, 15.5: 43, 20.5: 38, 25.5: 45 };
  const VELOCITY = { 5: 0.85, 10: 0.5, 15.5: 0.55, 20.5: 0.7, 25.5: 1 };
  MUSIC.chords.slice(1).forEach((t, n) => timpani(t, PITCH[t] ?? 45, VELOCITY[t] ?? 0.6, 100 + n));
  // The roll: strokes a fourteenth of a second apart on the dominant, growing to the end card.
  const [r0, r1] = MUSIC.roll;
  const jitter = noise(41);
  let n = 0;
  for (let t = r0; t < r1 - 0.06; t += 1 / 14, n++) {
    const x = (t - r0) / (r1 - r0);
    timpani(t + jitter() * 0.004, 40, 0.12 + 0.7 * x ** 2.2 * (n % 2 ? 0.92 : 1), 200 + n);
  }
  // A low boom under the two impacts.
  for (const t0 of MUSIC.impacts) {
    let ph = 0;
    place(stem("timpani"), t0, 2.5, 0.22, 0, (t) => {
      ph += (30 + 25 * Math.exp(-t / 0.25)) / SR;
      return Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.9) * Math.min(1, t / 0.005);
    });
  }
}

/* ---------- The clock ---------- */

{
  const [a, b, c] = MUSIC.ticks;
  const times = [];
  for (let t = a; t < b - 1e-9; t += 2 * BEAT) times.push(t);
  for (let t = b; t < c - 1e-9; t += BEAT) times.push(t);
  const rnd = noise(23);
  times.forEach((t0, n) => {
    const tock = n % 2 === 1;
    const f1 = tock ? 1650 : 1980;
    const f2 = tock ? 2700 : 3170;
    const hp = svf();
    hp.set(3000, 0.7);
    place(stem("ticks"), t0, 0.08, 0.4, tock ? -0.15 : 0.15, (t) => {
      const click = hp.run(rnd()).high * Math.exp(-t / 0.002);
      const wood = (Math.sin(2 * Math.PI * f1 * t) + 0.5 * Math.sin(2 * Math.PI * f2 * t)) * Math.exp(-t / 0.018);
      return (click * 0.6 + wood * 0.5) * Math.min(1, t / 0.0005);
    });
  });
}

/* ---------- Cymbals: a swell into each shot change, a crash on the end card ---------- */

{
  const target = stem("cymbals");
  const rL = noise(3);
  const rR = noise(5);
  MUSIC.risers.forEach((T, n) => {
    const D = n === 0 ? 1.2 : 1.8;
    const g = n === 0 ? 0.08 : 0.12;
    const fL = svf();
    const fR = svf();
    const s0 = at(T - D);
    for (let i = Math.max(0, s0); i < Math.min(N, at(T)); i++) {
      const x = (i - s0) / (at(T) - s0);
      if ((i - s0) % 32 === 0) {
        fL.set(3000 + 6000 * x, 0.8);
        fR.set(3200 + 6000 * x, 0.8);
      }
      const env = g * x ** 3 * Math.min(1, (at(T) - i) / (0.01 * SR));
      target[0][i] += fL.run(rL()).high * env;
      target[1][i] += fR.run(rR()).high * env;
    }
  });
  const crashL = svf();
  const crashR = svf();
  crashL.set(4000, 0.7);
  crashR.set(4300, 0.7);
  const t0 = MUSIC.impacts[MUSIC.impacts.length - 1];
  for (let i = at(t0); i < Math.min(N, at(t0 + 4)); i++) {
    const t = i / SR - t0;
    const env = 0.1 * Math.exp(-t / 1.1) * Math.min(1, t / 0.004);
    target[0][i] += crashL.run(rL()).high * env;
    target[1][i] += crashR.run(rR()).high * env;
  }
}

/* ---------- Tubular bells on the cards ---------- */

{
  const CHORDS = [[69], [69, 76, 81]];
  const RATIOS = [1, 2, 3, 4.2, 5.4];
  const AMPS = [0.6, 1, 0.7, 0.45, 0.3];
  const DECAYS = [5, 4, 3, 2.2, 1.6];
  MUSIC.bells.forEach((t0, b) => {
    CHORDS[Math.min(b, CHORDS.length - 1)].forEach((m, n) => {
      const f = hz(m);
      const ph = RATIOS.map(() => 0);
      place(stem("bells"), t0 + n * 0.07, 5.5, 0.06 * (1 - n * 0.12), n ? (n % 2 ? 0.35 : -0.35) : 0, (t) => {
        let v = 0;
        for (let k = 0; k < RATIOS.length; k++) {
          ph[k] += (f * RATIOS[k]) / SR;
          v += AMPS[k] * Math.sin(2 * Math.PI * ph[k]) * Math.exp(-t / DECAYS[k]);
        }
        return v * Math.min(1, t / 0.002);
      });
    });
  });
}

/* ---------- Aether: a low wind of space under it all, swelling at the shot changes ---------- */

{
  const target = stem("aether");
  const level = (t) => 0.075 * (0.5 + 0.5 * MUSIC.chords.reduce((m, c) => Math.max(m, Math.exp(-(((t - c) / 1.2) ** 2))), 0)) * smooth(0, 1.5, t);
  for (const ch of [0, 1]) {
    const rnd = noise(61 + ch);
    const f = svf();
    const x = target[ch];
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      if (i % 64 === 0) f.set(180 + 120 * Math.sin(2 * Math.PI * 0.07 * t + ch * 2), 1.6);
      x[i] = f.run(rnd()).band * level(t);
    }
  }
}

/* ---------- Reverb: a cathedral (Freeverb, with a pre-delay) ---------- */

function freeverb(input, { room = 0.93, damp = 0.22, spread = 23, predelay = 0.04 } = {}) {
  const scale = SR / 44100;
  const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const ALLPASSES = [556, 441, 341, 225];
  const out = bus();
  const feedback = room * 0.28 + 0.7;
  const pre = at(predelay);
  for (const ch of [0, 1]) {
    const off = ch ? spread : 0;
    const combs = COMBS.map((c) => ({ buf: new Float32Array(Math.round((c + off) * scale)), i: 0, store: 0 }));
    const aps = ALLPASSES.map((a) => ({ buf: new Float32Array(Math.round((a + off) * scale)), i: 0 }));
    const x = input[ch];
    const y = out[ch];
    const lp = svf();
    lp.set(6500, 0.7);
    for (let n = 0; n < N; n++) {
      const v = (n >= pre ? x[n - pre] : 0) * 0.015;
      let sum = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.store = o * (1 - damp) + c.store * damp;
        c.buf[c.i] = v + c.store * feedback;
        if (++c.i >= c.buf.length) c.i = 0;
        sum += o;
      }
      for (const a of aps) {
        const b = a.buf[a.i];
        a.buf[a.i] = sum + b * 0.5;
        if (++a.i >= a.buf.length) a.i = 0;
        sum = b - sum;
      }
      y[n] = lp.run(sum).low;
    }
  }
  return out;
}

/* ---------- Mix ---------- */

const dry = bus();
const send = bus();
for (const s of Object.values(STEMS)) {
  for (const ch of [0, 1]) {
    for (let i = 0; i < N; i++) {
      dry[ch][i] += s.bus[ch][i];
      send[ch][i] += s.bus[ch][i] * s.send;
    }
  }
}
const wet = freeverb(send);
const mix = bus();
{
  // A high-pass at 20 Hz (two one-pole stages): the 32' stays, DC goes.
  const k = Math.exp((-2 * Math.PI * 20) / SR);
  for (const ch of [0, 1]) {
    let x1 = 0;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;
    for (let i = 0; i < N; i++) {
      const x = dry[ch][i] + wet[ch][i] * 0.9;
      y1 = k * (y1 + x - x1);
      x1 = x;
      y2 = k * (y2 + y1 - x2);
      x2 = y1;
      const t = i / SR;
      const fade = Math.min(1, t / FADES.in) * Math.min(1, (SECONDS - t) / 1.0);
      mix[ch][i] = y2 * Math.sin((Math.PI / 2) * Math.max(0, fade));
    }
  }
}

/* ---------- Loudness (ITU-R BS.1770-4) and the limiter ---------- */

/** Integrated loudness in LUFS (K-weighted, 400 ms blocks, absolute and relative gates). */
export function loudness([l, r]) {
  const K = [
    { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] },
    { b: [1.0, -2.0, 1.0], a: [-1.99004745483398, 0.99007225036621] },
  ];
  const weighted = [l, r].map((x) => {
    let y = Float64Array.from(x);
    for (const { b, a } of K) {
      const out = new Float64Array(y.length);
      let x1 = 0;
      let x2 = 0;
      let y1 = 0;
      let y2 = 0;
      for (let i = 0; i < y.length; i++) {
        const v = b[0] * y[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
        x2 = x1;
        x1 = y[i];
        y2 = y1;
        y1 = v;
        out[i] = v;
      }
      y = out;
    }
    return y;
  });
  const block = at(0.4);
  const hop = at(0.1);
  const z = [];
  for (let s = 0; s + block <= weighted[0].length; s += hop) {
    let sum = 0;
    for (const ch of weighted) for (let i = s; i < s + block; i++) sum += ch[i] * ch[i];
    z.push(sum / block);
  }
  const lk = (v) => -0.691 + 10 * Math.log10(v);
  const abs = z.filter((v) => lk(v) > -70);
  const rel = lk(abs.reduce((a, v) => a + v, 0) / abs.length) - 10;
  const gated = abs.filter((v) => lk(v) > rel);
  return lk(gated.reduce((a, v) => a + v, 0) / gated.length);
}

/** True peak in dBTP: the largest sample after 4x oversampling (windowed-sinc interpolation). */
export function truePeak([l, r]) {
  const TAPS = 16;
  const phases = [1, 2, 3].map((p) => {
    const frac = p / 4;
    const h = [];
    for (let k = -TAPS + 1; k <= TAPS; k++) {
      const x = k - frac;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      h.push(sinc * (0.5 + 0.5 * Math.cos((Math.PI * x) / (TAPS + 0.5))));
    }
    return h;
  });
  let peak = 0;
  for (const x of [l, r]) {
    for (let i = TAPS; i < x.length - TAPS; i++) {
      peak = Math.max(peak, Math.abs(x[i]));
      for (const h of phases) {
        let s = 0;
        for (let k = 0; k < h.length; k++) s += h[k] * x[i - TAPS + 1 + k];
        if (Math.abs(s) > peak) peak = Math.abs(s);
      }
    }
  }
  return 20 * Math.log10(peak);
}

/** The lowest value of `a` within `w` samples on either side of each sample (a monotonic queue). */
function slidingMin(a, w) {
  const out = new Float32Array(a.length);
  const q = new Int32Array(a.length);
  let h = 0;
  let t = 0;
  for (let j = 0; j < a.length + w; j++) {
    if (j < a.length) {
      while (t > h && a[q[t - 1]] >= a[j]) t--;
      q[t++] = j;
    }
    const i = j - w;
    if (i < 0) continue;
    while (q[h] < i - w) h++;
    out[i] = a[q[h]];
  }
  return out;
}

/**
 * A look-ahead peak limiter. The gain each sample needs (ceiling / |sample|) is spread as a minimum
 * over 3 ms on either side, averaged over the same 6 ms (so it eases in before a peak and is at or
 * below what the peak needs when it arrives), then released over 80 ms.
 */
function limit([l, r], gain, ceiling) {
  const w = at(0.003);
  const need = new Float32Array(N);
  for (let i = 0; i < N; i++) need[i] = Math.min(1, ceiling / Math.max(1e-9, Math.abs(l[i] * gain), Math.abs(r[i] * gain)));
  const lowest = slidingMin(need, w);
  const sum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) sum[i + 1] = sum[i] + lowest[i];
  const out = bus();
  const rel = 1 - Math.exp(-1 / (0.08 * SR));
  let g = 1;
  let reduction = 1;
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(N, i + w + 1);
    // Samples past either end count as needing no reduction.
    const box = (sum[b] - sum[a] + (2 * w + 1 - (b - a))) / (2 * w + 1);
    g = box < g ? box : g + (box - g) * rel;
    reduction = Math.min(reduction, g);
    out[0][i] = l[i] * gain * g;
    out[1][i] = r[i] * gain * g;
  }
  out.reduction = -20 * Math.log10(reduction);
  return out;
}

function master() {
  const ceiling = dB(MUSIC.truePeak - 0.9);
  let gain = dB(MUSIC.lufs - loudness(mix));
  let out = limit(mix, gain, ceiling);
  for (let k = 0; k < 4; k++) {
    const off = MUSIC.lufs - loudness(out);
    if (Math.abs(off) < 0.05) break;
    gain *= dB(off);
    out = limit(mix, gain, ceiling);
  }
  out.gain = gain;
  return out;
}

function writeWav(file, [l, r]) {
  const data = Buffer.alloc(N * 8);
  for (let i = 0; i < N; i++) {
    data.writeFloatLE(l[i], i * 8);
    data.writeFloatLE(r[i], i * 8 + 4);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20); // IEEE float
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 8, 28);
  head.writeUInt16LE(8, 32);
  head.writeUInt16LE(32, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

const out = master();
writeWav(SCORE, out);
const lufs = loudness(out);
const tp = truePeak(out);
console.log(`${path.relative(process.cwd(), SCORE)}: ${SECONDS} s, ${lufs.toFixed(1)} LUFS, true peak ${tp.toFixed(1)} dBTP (gain ${(20 * Math.log10(out.gain)).toFixed(1)} dB, limiter at most ${out.reduction.toFixed(1)} dB)`);
// Each stem's level in the master, over the time it plays (RMS of its louder half-second windows).
for (const [name, s] of Object.entries(STEMS)) {
  const win = at(0.5);
  const levels = [];
  for (let a = 0; a + win <= N; a += win) {
    let e = 0;
    for (const ch of s.bus) for (let i = a; i < a + win; i++) e += ch[i] * ch[i];
    if (e > 1e-12) levels.push(10 * Math.log10(e / (2 * win)) + 20 * Math.log10(out.gain));
  }
  levels.sort((a, b) => b - a);
  const top = levels.slice(0, Math.max(1, Math.ceil(levels.length / 2)));
  console.log(`  ${name.padEnd(8)} ${(top.reduce((a, v) => a + v, 0) / top.length).toFixed(1).padStart(6)} dBFS RMS over ${(levels.length / 2).toFixed(1)} s`);
}
if (Math.abs(lufs - MUSIC.lufs) > 0.5 || tp > MUSIC.truePeak) throw new Error(`score: expected ${MUSIC.lufs} LUFS and at most ${MUSIC.truePeak} dBTP`);
