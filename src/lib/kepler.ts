/* Orbits, the way astronomers write them down: Keplerian elements (semi-major axis a,
   eccentricity e, inclination i, longitude of the ascending node, argument of periapsis, mean
   anomaly at t = 0) and Kepler's equation M = E - e sin E, solved by Newton's method. The mean
   motion follows Kepler's third law (period grows with a^1.5).

   Every derivative of a model orbits it in its family's band (FAMILY_BANDS): quantizations in a
   thin inner belt, adapters in a flat ring, fine-tunes on inclined planetary orbits, and merges
   on long, eccentric comet orbits. The GPU solves the same equation per point
   (three/shaders.ts); these functions place the named planets and are unit-tested. */
import type { Relation } from "../data/types.ts";

export type Vec3 = [number, number, number];

export interface Orbit {
  a: number;
  e: number;
  /** Inclination, radians. */
  i: number;
  /** Longitude of the ascending node, radians. */
  node: number;
  /** Argument of periapsis, radians. */
  peri: number;
  /** Mean anomaly at t = 0, radians. */
  M0: number;
  /** Mean motion, radians per second. */
  n: number;
}

/** Radians per second at a = 1 (a 30-second year). */
export const MEAN_MOTION_AT_1 = (2 * Math.PI) / 30;

/** Kepler's third law: n = n1 / a^1.5. */
export function meanMotion(a: number): number {
  return MEAN_MOTION_AT_1 / a ** 1.5;
}

/** Solves M = E - e sin E for the eccentric anomaly E (e < 1). */
export function eccentricAnomaly(M: number, e: number): number {
  const m = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = e > 0.8 ? Math.PI : m;
  for (let k = 0; k < 12; k++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/**
 * The perifocal frame's unit vectors P (toward periapsis) and Q (90° ahead in the orbit's plane),
 * in the scene's frame (y up; the reference plane is x-z).
 */
export function perifocal(o: Pick<Orbit, "i" | "node" | "peri">): { P: Vec3; Q: Vec3 } {
  const cO = Math.cos(o.node);
  const sO = Math.sin(o.node);
  const cw = Math.cos(o.peri);
  const sw = Math.sin(o.peri);
  const ci = Math.cos(o.i);
  const si = Math.sin(o.i);
  // The usual z-up vectors, turned so the reference plane lies in x-z: (x, y, z) -> (x, z, -y).
  const P: Vec3 = [cO * cw - sO * sw * ci, sw * si, -(sO * cw + cO * sw * ci)];
  const Q: Vec3 = [-cO * sw - sO * cw * ci, cw * si, -(-sO * sw + cO * cw * ci)];
  return { P, Q };
}

/** Where a body on orbit `o` is at time t (seconds), relative to what it orbits. */
export function orbitPosition(o: Orbit, t: number): Vec3 {
  const E = eccentricAnomaly(o.M0 + o.n * t, o.e);
  const x = o.a * (Math.cos(E) - o.e);
  const y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const { P, Q } = perifocal(o);
  return [x * P[0] + y * Q[0], x * P[1] + y * Q[1], x * P[2] + y * Q[2]];
}

interface Band {
  /** Semi-major axis, as a share of the system's scale. */
  a: [number, number];
  e: [number, number];
  /** Inclination to the system's plane, degrees. */
  i: [number, number];
}

/** Each family's orbits, inside out, in units of the system's scale. */
export const FAMILY_BANDS: Record<Relation, Band> = {
  quantized: { a: [0.34, 0.46], e: [0, 0.03], i: [0, 1.5] },
  adapter: { a: [0.52, 0.66], e: [0, 0.008], i: [0, 0.4] },
  finetune: { a: [0.72, 1.0], e: [0, 0.1], i: [0, 9] },
  merge: { a: [0.7, 1.05], e: [0.45, 0.75], i: [0, 50] },
};

const DEG = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** An orbit in `relation`'s band for a system of the given scale, from a uniform generator. */
export function familyOrbit(relation: Relation, rand: () => number, scale: number): Orbit {
  const band = FAMILY_BANDS[relation];
  // Belts and rings bunch toward their middle; planets and comets spread evenly.
  const u = relation === "quantized" || relation === "adapter" ? (rand() + rand() + rand()) / 3 : rand();
  const a = lerp(band.a[0], band.a[1], u) * scale;
  return {
    a,
    e: lerp(band.e[0], band.e[1], rand()),
    i: lerp(band.i[0], band.i[1], rand()) * DEG,
    node: rand() * 2 * Math.PI,
    peri: rand() * 2 * Math.PI,
    M0: rand() * 2 * Math.PI,
    n: meanMotion(a),
  };
}

/** Rotates v by `angle` around the unit axis `axis` (Rodrigues). */
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const [kx, ky, kz] = axis;
  const dot = kx * v[0] + ky * v[1] + kz * v[2];
  return [
    v[0] * c + (ky * v[2] - kz * v[1]) * s + kx * dot * (1 - c),
    v[1] * c + (kz * v[0] - kx * v[2]) * s + ky * dot * (1 - c),
    v[2] * c + (kx * v[1] - ky * v[0]) * s + kz * dot * (1 - c),
  ];
}
