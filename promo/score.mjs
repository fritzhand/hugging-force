/* The promo's soundtrack, synthesized here from code: no samples, no licensed music.

   D major, 120 BPM, one chord per shot (storyboard.mjs MUSIC): detuned saw pads under a sweeping
   low-pass with a high shimmer and a breath of air above them, a bass that follows the roots, an
   arpeggio with a ping-pong delay from the first impact to the end card, a soft kick on every other
   beat, ticks on the off-beats, noise risers into each shot change, low impacts, FM bells on the two
   cards and a mallet note on each family and arm beat. Every stem sends to one reverb (Freeverb).
   The mix is then measured as BS.1770 loudness, brought to MUSIC.lufs and limited below
   MUSIC.truePeak (measured 4x oversampled), and each stem's level is reported.

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
const pan = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

/* ---------- Harmony: one chord per shot (and A7sus4 resolving to A7 under the arm beats) ---------- */

const HARMONY = [
  { at: 0, name: "Dmaj9", pad: [50, 57, 64, 66, 73], root: 38, arp: [62, 66, 69, 73, 76, 78] },
  { at: 5, name: "Bm11", pad: [47, 54, 62, 64, 69], root: 35, arp: [59, 62, 66, 69, 73, 76] },
  { at: 10, name: "Gmaj7#11", pad: [43, 50, 59, 66, 73], root: 43, arp: [55, 62, 66, 71, 73, 78] },
  { at: 15.5, name: "Em9", pad: [52, 59, 62, 66, 67], root: 40, arp: [64, 67, 71, 74, 78, 79] },
  { at: 20.5, name: "A7sus4", pad: [45, 52, 57, 62, 67], root: 45, arp: [57, 62, 64, 67, 69, 76] },
  { at: 23.6, name: "A7", pad: [45, 52, 57, 61, 67], root: 45, arp: [57, 61, 64, 67, 69, 76] },
  { at: 25.5, name: "Dmaj9", pad: [50, 57, 64, 66, 73, 78], root: 38, arp: [] },
];
for (const t of MUSIC.chords) if (!HARMONY.some((h) => h.at === t)) throw new Error(`score: no chord at ${t} s (storyboard MUSIC.chords)`);
const chordAt = (t) => [...HARMONY].reverse().find((h) => h.at <= t + 1e-9);
const endOf = (k) => (k + 1 < HARMONY.length ? HARMONY[k + 1].at : SECONDS);

/** Each accent's note: rising chord tones, four over the families, four over the arms. */
const ACCENT_NOTES = [76, 79, 83, 86, 81, 86, 88, 93];
if (ACCENT_NOTES.length !== MUSIC.accents.length) throw new Error("score: one accent note per MUSIC.accents entry");

/* ---------- Stems, each with its reverb send ---------- */

const bus = () => [new Float32Array(N), new Float32Array(N)];
const STEMS = {
  pad: { send: 0.4 },
  shimmer: { send: 0.8 },
  air: { send: 0.3 },
  bass: { send: 0 },
  arp: { send: 0.22 },
  kick: { send: 0.05 },
  ticks: { send: 0.15 },
  risers: { send: 0.45 },
  impacts: { send: 0.35 },
  bells: { send: 0.6 },
  accents: { send: 0.5 },
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

/** A band-limited sawtooth. */
function saw(f, phase = 0) {
  let p = phase;
  const dt = f / SR;
  return () => {
    const v = 2 * p - 1 - polyblep(p, dt);
    p += dt;
    if (p >= 1) p -= 1;
    return v;
  };
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

/** Exponential interpolation through [time, value] keys (values above zero). */
function curve(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        return v0 * (v1 / v0) ** ((t - t0) / (t1 - t0));
      }
    }
    return keys[keys.length - 1][1];
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

/** A swell for a chord held from `a` to `b` (seconds since the voice started), released over `tau`. */
function held(t, attack, length, tau) {
  const x = Math.min(1, t / attack);
  return x * x * (3 - 2 * x) * (t > length ? Math.exp(-(t - length) / tau) : 1);
}

/* ---------- Pads, shimmer and air ---------- */

{
  const DETUNE = [-9, 0, 9];
  const PAN = [-0.85, 0, 0.85];
  HARMONY.forEach((h, k) => {
    const start = Math.max(0, h.at - 0.2);
    const length = endOf(k) - start;
    const attack = k === 0 ? 2.8 : 0.9;
    h.pad.forEach((m, n) => {
      DETUNE.forEach((cents, v) => {
        const osc = saw(hz(m) * 2 ** (cents / 1200), (n * 0.37 + v * 0.29) % 1);
        place(stem("pad"), start, length + 3, 0.042, PAN[v], (t) => osc() * held(t, attack, length, 0.75));
      });
    });
    // Two octaves above the chord's upper two notes, trembling slowly, far left and right.
    h.pad.slice(-2).forEach((m, n) => {
      let p = 0;
      const f = hz(m + 24);
      place(stem("shimmer"), start, length + 3, 0.012, n ? 0.9 : -0.9, (t) => {
        p += f / SR;
        return Math.sin(2 * Math.PI * p) * (0.6 + 0.4 * Math.sin(2 * Math.PI * (0.31 + 0.07 * n) * t)) * held(t, attack * 1.4, length, 0.9);
      });
    });
  });
  // The pads open with the cut: dark under the title, brightest on the end card's impact.
  const cutoff = curve([
    [0, 450],
    [4.6, 1700],
    [5, 2300],
    [9.8, 3100],
    [10, 3600],
    [15.4, 4000],
    [15.6, 3000],
    [20.4, 4000],
    [20.6, 3500],
    [25.4, 5800],
    [25.6, 4900],
    [30, 2000],
  ]);
  const padBus = stem("pad");
  for (const ch of [0, 1]) {
    const f = svf();
    const x = padBus[ch];
    for (let i = 0; i < N; i++) {
      if (i % 32 === 0) {
        const t = i / SR;
        f.set(cutoff(t) * (1 + 0.08 * Math.sin(2 * Math.PI * 0.13 * t + ch)), 0.8);
      }
      x[i] = f.run(x[i]).low;
    }
  }
  // Air: high noise that breathes with the cut.
  const air = stem("air");
  const level = curve([
    [0, 0.002],
    [3, 0.006],
    [5, 0.009],
    [15.5, 0.011],
    [25.5, 0.016],
    [28, 0.01],
    [30, 0.004],
  ]);
  for (const ch of [0, 1]) {
    const rnd = noise(17 + ch);
    const f = svf();
    f.set(7000, 0.7);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      air[ch][i] = f.run(rnd()).high * level(t) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 0.25 * t + ch * 1.7));
    }
  }
}

/* ---------- Bass: the chord roots, gliding ---------- */

{
  const bass = stem("bass");
  let phase = 0;
  let f = hz(HARMONY[0].root);
  const glide = Math.exp(-1 / (0.05 * SR));
  const root = new Float32Array(N);
  HARMONY.forEach((h, k) => root.fill(hz(h.root), at(h.at), at(endOf(k))));
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    f = root[i] + (f - root[i]) * glide;
    phase += f / SR;
    if (phase >= 1) phase -= 1;
    // In from just before the first impact, a little stronger once the kick is in.
    const env = 0.06 * Math.min(1, Math.max(0, (t - 3.8) / 1.2)) + 0.024 * Math.min(1, Math.max(0, (t - 9.5) / 0.5));
    // A second harmonic, so the line carries on small speakers too.
    const v = (Math.sin(2 * Math.PI * phase) + 0.3 * Math.sin(4 * Math.PI * phase)) * env;
    bass[0][i] = v;
    bass[1][i] = v;
  }
}

/* ---------- Arpeggio, with a ping-pong delay ---------- */

{
  const arp = stem("arp");
  const PATTERN = [0, 2, 4, 5, 3, 1, 4, 2];
  const [p0, p1] = MUSIC.pulse;
  // A beat of rest before each riser lands.
  const rests = MUSIC.risers.map((t) => [t - BEAT, t]);
  const step = BEAT / 2;
  for (let k = 0; p0 + k * step < p1 - 1e-9; k++) {
    const t0 = p0 + k * step;
    if (rests.some(([a, b]) => t0 >= a - 1e-9 && t0 < b - 1e-9)) continue;
    const notes = chordAt(t0).arp;
    if (!notes.length) continue;
    const m = notes[PATTERN[k % PATTERN.length]];
    const vel = (k % 2 === 0 ? 1 : 0.72) * (t0 < 10 ? 0.55 + 0.05 * (t0 - 5) : t0 < 20.5 ? 0.85 : 0.95 + 0.04 * (t0 - 20.5));
    const osc = saw(hz(m));
    const low = saw(hz(m) * 0.5, 0.5);
    const f = svf();
    let i = 0;
    place(arp, t0, 0.9, 0.19 * vel, k % 2 ? 0.35 : -0.35, (t) => {
      if (i++ % 16 === 0) f.set(600 + 4800 * Math.exp(-t / 0.075), 1.1);
      const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.2);
      return f.run(osc() * 0.8 + low() * 0.35).low * env;
    });
  }
  // Ping-pong delay: a dotted eighth, damped repeats crossing the stereo field.
  const d = at(BEAT * 0.75);
  const fb = 0.38;
  const wet = 0.3;
  const bufL = new Float32Array(d);
  const bufR = new Float32Array(d);
  let lpL = 0;
  let lpR = 0;
  const damp = Math.exp((-2 * Math.PI * 3200) / SR);
  for (let i = 0; i < N; i++) {
    const j = i % d;
    const outL = bufL[j];
    const outR = bufR[j];
    lpL = outL + (lpL - outL) * damp;
    lpR = outR + (lpR - outR) * damp;
    const inL = arp[0][i];
    const inR = arp[1][i];
    bufL[j] = (inL + inR) * 0.5 + lpR * fb;
    bufR[j] = lpL * fb;
    arp[0][i] = inL + outL * wet;
    arp[1][i] = inR + outR * wet;
  }
}

/* ---------- Kick (every other beat), with a side-chain on the pads, shimmer and arpeggio ---------- */

{
  const kicks = [];
  const [k0, k1] = MUSIC.kick;
  for (let t = k0; t < k1 - 1e-9; t += 2 * BEAT) kicks.push(t);
  const click = noise(7);
  for (const t0 of kicks) {
    let phase = 0;
    place(stem("kick"), t0, 0.6, 0.24, 0, (t) => {
      phase += (44 + 80 * Math.exp(-t / 0.028)) / SR;
      const body = Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.26) * Math.min(1, t / 0.001);
      return body + click() * 0.12 * Math.exp(-t / 0.004);
    });
  }
  const duck = new Float32Array(N).fill(1);
  for (const t0 of kicks) for (let i = at(t0); i < Math.min(N, at(t0 + 0.5)); i++) duck[i] = Math.min(duck[i], 1 - 0.28 * Math.exp(-(i / SR - t0) / 0.16));
  for (const name of ["pad", "shimmer", "arp"]) for (const ch of [0, 1]) for (let i = 0; i < N; i++) stem(name)[ch][i] *= duck[i];
}

/* ---------- Ticks on the off-beats, from the tree shot to the end card ---------- */

{
  const rnd = noise(11);
  const [a, b] = [MUSIC.chords[3], MUSIC.chords[5] - BEAT];
  for (let t0 = a + BEAT / 2; t0 < b - 1e-9; t0 += BEAT) {
    const f = svf();
    f.set(7500, 0.7);
    place(stem("ticks"), t0, 0.08, 0.15, 0.25, (t) => f.run(rnd()).high * Math.exp(-t / 0.022));
  }
}

/* ---------- Risers into each shot change ---------- */

{
  const risers = stem("risers");
  const rL = noise(3);
  const rR = noise(5);
  MUSIC.risers.forEach((T, n) => {
    const D = n === 0 ? 1.4 : 1.8;
    const g = n === 0 ? 0.13 : 0.2;
    const fL = svf();
    const fR = svf();
    const s0 = at(T - D);
    for (let i = Math.max(0, s0); i < Math.min(N, at(T)); i++) {
      const x = (i - s0) / (at(T) - s0);
      if ((i - s0) % 32 === 0) {
        const fc = 260 * (7200 / 260) ** x;
        fL.set(fc, 2.2);
        fR.set(fc * 1.06, 2.2);
      }
      const env = g * x ** 2.4 * Math.min(1, (at(T) - i) / (0.008 * SR));
      risers[0][i] += fL.run(rL()).band * env;
      risers[1][i] += fR.run(rR()).band * env;
    }
  });
}

/* ---------- Impacts ---------- */

{
  const rnd = noise(13);
  for (const t0 of MUSIC.impacts) {
    let phase = 0;
    const f = svf();
    f.set(900, 0.7);
    place(stem("impacts"), t0, 3.2, 0.45, 0, (t) => {
      phase += (36 + 70 * Math.exp(-t / 0.22)) / SR;
      const boom = Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.95) * Math.min(1, t / 0.006);
      return boom + f.run(rnd()).low * 0.5 * Math.exp(-t / 0.3);
    });
  }
}

/* ---------- Bells (FM) on the two cards ---------- */

{
  const CHORDS = [
    [74, 81, 86],
    [74, 78, 81, 86, 90],
  ];
  MUSIC.bells.forEach((t0, b) => {
    CHORDS[Math.min(b, CHORDS.length - 1)].forEach((m, n) => {
      const c = hz(m);
      let pc = 0;
      let pm = 0;
      let pi = 0;
      place(stem("bells"), t0 + n * 0.045, 5, 0.075 * (1 - n * 0.08), n ? (n % 2 ? 0.3 : -0.3) : 0, (t) => {
        pm += (c * 2) / SR;
        pc += c / SR;
        pi += (c * 2.756) / SR;
        const tone = Math.sin(2 * Math.PI * pc + 2.0 * Math.exp(-t / 0.35) * Math.sin(2 * Math.PI * pm));
        const shimmer = 0.25 * Math.sin(2 * Math.PI * pi) * Math.exp(-t / 0.5);
        return (tone + shimmer) * Math.exp(-t / 2.2) * Math.min(1, t / 0.002);
      });
    });
  });
}

/* ---------- A mallet note on each family and arm beat ---------- */

MUSIC.accents.forEach((t0, n) => {
  const c = hz(ACCENT_NOTES[n]);
  let p1 = 0;
  let p4 = 0;
  place(stem("accents"), t0, 1.6, 0.1, -0.3 + 0.2 * (n % 4), (t) => {
    p1 += c / SR;
    p4 += (c * 4) / SR;
    const body = Math.sin(2 * Math.PI * p1 + 0.9 * Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * p1));
    return (body * Math.exp(-t / 0.55) + 0.18 * Math.sin(2 * Math.PI * p4) * Math.exp(-t / 0.12)) * Math.min(1, t / 0.0015);
  });
});

/* ---------- Reverb (Freeverb) ---------- */

function freeverb(input, { room = 0.86, damp = 0.32, spread = 23 } = {}) {
  const scale = SR / 44100;
  const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const ALLPASSES = [556, 441, 341, 225];
  const out = bus();
  const feedback = room * 0.28 + 0.7;
  for (const ch of [0, 1]) {
    const off = ch ? spread : 0;
    const combs = COMBS.map((c) => ({ buf: new Float32Array(Math.round((c + off) * scale)), i: 0, store: 0 }));
    const aps = ALLPASSES.map((a) => ({ buf: new Float32Array(Math.round((a + off) * scale)), i: 0 }));
    const x = input[ch];
    const y = out[ch];
    for (let n = 0; n < N; n++) {
      const v = x[n] * 0.015;
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
      y[n] = sum;
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
  // A high-pass at 28 Hz (two one-pole stages) keeps the low end clean of DC.
  const k = Math.exp((-2 * Math.PI * 28) / SR);
  for (const ch of [0, 1]) {
    let x1 = 0;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;
    for (let i = 0; i < N; i++) {
      const x = dry[ch][i] + wet[ch][i] * 0.8;
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
    if (e > 0) levels.push(10 * Math.log10(e / (2 * win)) + 20 * Math.log10(out.gain));
  }
  levels.sort((a, b) => b - a);
  const top = levels.slice(0, Math.max(1, Math.ceil(levels.length / 2)));
  console.log(`  ${name.padEnd(8)} ${(top.reduce((a, v) => a + v, 0) / top.length).toFixed(1).padStart(6)} dBFS RMS over ${(levels.length / 2).toFixed(1)} s`);
}
if (Math.abs(lufs - MUSIC.lufs) > 0.5 || tp > MUSIC.truePeak) throw new Error(`score: expected ${MUSIC.lufs} LUFS and at most ${MUSIC.truePeak} dBTP`);
