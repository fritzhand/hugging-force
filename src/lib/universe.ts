/* The catalog, turned into the universe's bodies: pure numbers the engine uploads as they are.

   Stars: one per model, placed by galaxy.ts, colored by its temperature, sized by its parameters,
   glowing with its downloads. Orbits: one body per derivative the Hub lists (every count is the
   Hub's), on a Kepler orbit in its family's band; a merge is a comet with a short tail. Named
   bodies: the most downloaded members of each family, which the selected system shows and labels.

   Each system's orbits lie in its own tilted plane, and every orbit comes from a generator seeded
   by the model's id, so the universe is identical on every visit. */
import { RELATIONS, type Catalog, type Derivative, type Relation } from "../data/types.ts";
import { starColor } from "./blackbody.ts";
import { ARM_ORDER, placeStars } from "./galaxy.ts";
import { fnv1a, seeded, unitHash } from "./hash.ts";
import { familyOrbit, perifocal, rotate, type Orbit, type Vec3 } from "./kepler.ts";
import { logUnit, starGlow, starRadius, temperature } from "./scales.ts";

export interface Star {
  id: string;
  index: number;
  arm: number;
  pos: Vec3;
  /** Linear RGB. */
  color: [number, number, number];
  kelvin: number;
  core: number;
  glow: number;
  /** The radius the system's orbits are scaled to. */
  scale: number;
  /** The system's orbital plane: a tilt angle around an axis in the disc. */
  tiltAxis: Vec3;
  tilt: number;
  /** Every derivative the Hub lists, all families. */
  derivatives: number;
}

/** The comet tail's points after its head. */
export const TAIL = 6;

export interface OrbitBuffers {
  count: number;
  P: Float32Array;
  Q: Float32Array;
  /** a, e, M0, n per body. */
  orbit: Float32Array;
  /** family index, system index, arm index, tail step (0 for a body). */
  meta: Float32Array;
}

export interface Named {
  system: number;
  relation: Relation;
  model: Derivative;
  orbit: Orbit;
  P: Vec3;
  Q: Vec3;
  /** World units. */
  size: number;
}

/** A system's scale grows with the number of models built on it. */
export function systemScale(derivatives: number): number {
  return 1.1 + 1.0 * logUnit(derivatives + 1, 10, 50000);
}

export function buildStars(catalog: Catalog): Star[] {
  const places = placeStars(
    catalog.systems.map((s) => ({ id: s.id, modality: s.modality, createdAt: s.createdAt })),
    catalog.fetchedAt,
  );
  return catalog.systems.map((s, index) => {
    const p = places[index];
    const kelvin = temperature(s.trendingScore);
    const derivatives = RELATIONS.reduce((a, r) => a + s.tree[r].count, 0);
    const phi = unitHash(`${s.id}:tilt-axis`) * Math.PI * 2;
    return {
      id: s.id,
      index,
      arm: ARM_ORDER.indexOf(s.modality),
      pos: [p.x, p.y, p.z],
      color: starColor(kelvin),
      kelvin,
      core: starRadius(s.parameters),
      glow: starGlow(s.downloads),
      scale: systemScale(derivatives),
      tiltAxis: [Math.cos(phi), 0, Math.sin(phi)],
      tilt: 0.12 + 0.5 * unitHash(`${s.id}:tilt`),
      derivatives,
    };
  });
}

/** The orbit's frame, turned into its system's plane. */
function frame(o: Orbit, star: Star): { P: Vec3; Q: Vec3 } {
  const { P, Q } = perifocal(o);
  return { P: rotate(P, star.tiltAxis, star.tilt), Q: rotate(Q, star.tiltAxis, star.tilt) };
}

export function buildOrbits(catalog: Catalog, stars: readonly Star[]): OrbitBuffers {
  let count = 0;
  for (const s of catalog.systems) for (const r of RELATIONS) count += s.tree[r].count * (r === "merge" ? 1 + TAIL : 1);
  const P = new Float32Array(count * 3);
  const Q = new Float32Array(count * 3);
  const orbit = new Float32Array(count * 4);
  const meta = new Float32Array(count * 4);
  let n = 0;
  const put = (o: Orbit, f: { P: Vec3; Q: Vec3 }, family: number, system: number, arm: number, tail: number) => {
    P.set(f.P, n * 3);
    Q.set(f.Q, n * 3);
    orbit[n * 4] = o.a;
    orbit[n * 4 + 1] = o.e;
    orbit[n * 4 + 2] = o.M0;
    orbit[n * 4 + 3] = o.n;
    meta[n * 4] = family;
    meta[n * 4 + 1] = system;
    meta[n * 4 + 2] = arm;
    meta[n * 4 + 3] = tail;
    n++;
  };
  catalog.systems.forEach((s, system) => {
    const star = stars[system];
    RELATIONS.forEach((relation, family) => {
      const rand = seeded(fnv1a(`${s.id}:${relation}`));
      for (let k = 0; k < s.tree[relation].count; k++) {
        const o = familyOrbit(relation, rand, star.scale);
        const f = frame(o, star);
        put(o, f, family, system, star.arm, 0);
        if (relation === "merge") for (let t = 1; t <= TAIL; t++) put(o, f, family, system, star.arm, t);
      }
    });
  });
  return { count, P, Q, orbit, meta };
}

/** The named members of every family: the bodies a selected system labels. */
export function buildNamed(catalog: Catalog, stars: readonly Star[]): Named[] {
  const out: Named[] = [];
  catalog.systems.forEach((s, system) => {
    const star = stars[system];
    for (const relation of RELATIONS) {
      for (const model of s.tree[relation].top) {
        const rand = seeded(fnv1a(`${s.id}:${model.id}`));
        const orbit = familyOrbit(relation, rand, star.scale);
        const { P, Q } = frame(orbit, star);
        out.push({ system, relation, model, orbit, P, Q, size: 0.03 + 0.045 * logUnit(model.downloads + 1, 100, 1e7) });
      }
    }
  });
  return out;
}

/** A body's position at time t from its frame (the same arithmetic as the GPU's). */
export function bodyPosition(b: Pick<Named, "orbit" | "P" | "Q">, t: number, center: Vec3): Vec3 {
  const { orbit: o, P, Q } = b;
  const m = (((o.M0 + o.n * t) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = o.e > 0.8 ? Math.PI : m;
  for (let k = 0; k < 7; k++) E -= (E - o.e * Math.sin(E) - m) / (1 - o.e * Math.cos(E));
  const x = o.a * (Math.cos(E) - o.e);
  const y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  return [center[0] + x * P[0] + y * Q[0], center[1] + x * P[1] + y * Q[1], center[2] + x * P[2] + y * Q[2]];
}
