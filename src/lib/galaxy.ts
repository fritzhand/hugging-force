/* Where every star stands: a spiral galaxy seen in the x-z plane (y up).

   - Each of Hugging Face's four main modalities owns an arm, a logarithmic spiral (the shape of
     real spiral arms) with a pitch of GALAXY.pitch.
   - Distance from the core is time on the Hub: the arms start at March 2022 (GALAXY.inner) and
     end at the snapshot's date (GALAXY.outer), at a constant rate, so equal distances are equal
     times and every year is a ring. Repositories older than March 2022 all carry the Hub's
     2022-03-02 migration date, so their true age is unknown: they sit in the bulge around the
     core, "before March 2022".
   - A star keeps its distance (its date) and moves only around the core and above or below the
     disc to keep clear of its neighbors (placeStars).

   Pure and deterministic (unit-tested): the same catalog always gives the same galaxy. */
import type { Modality } from "../data/types.ts";
import { gaussian, seeded, unitHash } from "./hash.ts";

export const GALAXY = {
  /** The bulge's outer radius: models whose true age the Hub does not record. */
  bulge: 8.6,
  /** Where the arms begin: March 2022. */
  inner: 11,
  /** Where the arms end: the snapshot's date. */
  outer: 54,
  /** The arms' pitch angle (real spiral galaxies run about 10° to 40°). */
  pitch: (22 * Math.PI) / 180,
  /** How far the arm pattern is turned. */
  twist: 0.6,
  /** Stars sit within this height of the disc. */
  thickness: 0.9,
  /** Two stars stay at least this far apart. */
  minGap: 4.4,
  /** How far a star may move around the core from its arm's center line, radians. */
  armSpread: 0.42,
  bulgeSpread: 1.3,
} as const;

/** The arms, in their order around the core. */
export const ARM_ORDER: readonly Modality[] = ["nlp", "cv", "audio", "multimodal"];

/** The arms begin here (UTC ms). */
export const ARMS_START = Date.UTC(2022, 2, 1);
/** A repository created before this date shows the Hub's migration date, not its own. */
export const LEGACY_BEFORE = Date.UTC(2022, 2, 3);

export function isLegacy(createdAt: string): boolean {
  return Date.parse(createdAt) < LEGACY_BEFORE;
}

/** The angle of arm `k` (an index in ARM_ORDER) at radius `r`. */
export function armAngle(k: number, r: number): number {
  return GALAXY.twist + (k * 2 * Math.PI) / ARM_ORDER.length + Math.log(Math.max(r, 0.5) / GALAXY.inner) / Math.tan(GALAXY.pitch);
}

/** The radius of a date (UTC ms) on the arms. */
export function radiusOfTime(ms: number, fetchedAt: string): number {
  const end = Date.parse(fetchedAt);
  const f = Math.min(1, Math.max(0, (ms - ARMS_START) / (end - ARMS_START)));
  return GALAXY.inner + (GALAXY.outer - GALAXY.inner) * f;
}

/** A model's distance from the core: its creation date on the arms, or a place in the bulge. */
export function timeRadius(createdAt: string, fetchedAt: string, id: string): number {
  if (isLegacy(createdAt)) return 3.4 + (GALAXY.bulge - 3.8) * unitHash(`${id}:bulge`);
  return radiusOfTime(Date.parse(createdAt), fetchedAt);
}

export interface StarInput {
  id: string;
  modality: Modality;
  createdAt: string;
}

export interface StarPlace {
  id: string;
  /** Index of the star's arm in ARM_ORDER. */
  arm: number;
  r: number;
  angle: number;
  x: number;
  y: number;
  z: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Places every star on its arm at its date, then moves neighbors apart without changing dates. */
export function placeStars(items: readonly StarInput[], fetchedAt: string): StarPlace[] {
  const stars = items.map((it) => {
    const arm = ARM_ORDER.indexOf(it.modality);
    if (arm < 0) throw new Error(`${it.id}: no arm for ${it.modality}`);
    const r = timeRadius(it.createdAt, fetchedAt, it.id);
    const legacy = isLegacy(it.createdAt);
    const center = armAngle(arm, r);
    const spread = legacy ? GALAXY.bulgeSpread : GALAXY.armSpread;
    const angle = center + (unitHash(`${it.id}:angle`) - 0.5) * spread * 0.6;
    const y = (unitHash(`${it.id}:y`) - 0.5) * 2 * GALAXY.thickness * (legacy ? 1.6 : 1);
    return { id: it.id, arm, r, angle, center, spread, y, x: 0, z: 0 };
  });
  const place = (s: (typeof stars)[number]) => {
    s.x = s.r * Math.cos(s.angle);
    s.z = s.r * Math.sin(s.angle);
  };
  stars.forEach(place);
  // Relax: push close pairs apart around the core and vertically; their radii (dates) stay put.
  for (let pass = 0; pass < 120; pass++) {
    let moved = false;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const a = stars[i];
        const b = stars[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d >= GALAXY.minGap) continue;
        moved = true;
        const push = (GALAXY.minGap - d) * 0.5 + 0.01;
        const side = wrap(a.angle - b.angle) >= 0 ? 1 : -1;
        a.angle += (side * push) / Math.max(a.r, 1);
        b.angle -= (side * push) / Math.max(b.r, 1);
        const up = a.y >= b.y ? 1 : -1;
        a.y += up * push * 0.25;
        b.y -= up * push * 0.25;
        for (const s of [a, b]) {
          const off = wrap(s.angle - s.center);
          if (Math.abs(off) > s.spread) s.angle = s.center + Math.sign(off) * s.spread;
          const lim = GALAXY.thickness * 2.4;
          s.y = Math.max(-lim, Math.min(lim, s.y));
          place(s);
        }
      }
    }
    if (!moved) break;
  }
  return stars.map(({ id, arm, r, angle, x, y, z }) => ({ id, arm, r, angle, x, y, z }));
}

export interface Ring {
  /** The year that starts on this ring. */
  year: number;
  r: number;
}

/** A ring for every January 1 between the arms' start and the snapshot. */
export function yearRings(fetchedAt: string): Ring[] {
  const end = Date.parse(fetchedAt);
  const out: Ring[] = [];
  for (let y = new Date(ARMS_START).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= end; y++) out.push({ year: y, r: radiusOfTime(Date.UTC(y, 0, 1), fetchedAt) });
  return out;
}

/** Decorative dust (not data): which part of the galaxy each grain belongs to. */
export const DUST_KIND = { bulge: 4, field: 5 } as const;

export interface Dust {
  /** x, y, z per grain. */
  positions: Float32Array;
  /** 0-3: an arm (index in ARM_ORDER); 4: the bulge; 5: the field between the arms. */
  kind: Float32Array;
  /** 0 to 1, per grain. */
  brightness: Float32Array;
}

/** The galaxy's dust: grains along each arm, a bulge around the core and a faint field. */
export function dust(perArm: number, bulge: number, field: number, seed = 7): Dust {
  const total = perArm * ARM_ORDER.length + bulge + field;
  const positions = new Float32Array(total * 3);
  const kind = new Float32Array(total);
  const brightness = new Float32Array(total);
  const rand = seeded(seed);
  let n = 0;
  const put = (x: number, y: number, z: number, k: number, b: number) => {
    positions[n * 3] = x;
    positions[n * 3 + 1] = y;
    positions[n * 3 + 2] = z;
    kind[n] = k;
    brightness[n] = b;
    n++;
  };
  for (let arm = 0; arm < ARM_ORDER.length; arm++) {
    for (let i = 0; i < perArm; i++) {
      // Denser toward the inner arm; a little past the snapshot's edge so the arms fade out.
      const r = GALAXY.inner * 0.55 + (GALAXY.outer * 1.08 - GALAXY.inner * 0.55) * rand() ** 1.25;
      const spread = 0.12 + 0.1 * (r / GALAXY.outer);
      const a = armAngle(arm, r) + gaussian(rand) * spread;
      const rr = r + gaussian(rand) * 0.9;
      put(rr * Math.cos(a), gaussian(rand) * (0.35 + 0.012 * r), rr * Math.sin(a), arm, rand() ** 2);
    }
  }
  for (let i = 0; i < bulge; i++) {
    const r = Math.abs(gaussian(rand)) * GALAXY.bulge * 0.42;
    const a = rand() * 2 * Math.PI;
    put(r * Math.cos(a), gaussian(rand) * 0.9 * Math.exp(-r / 6), r * Math.sin(a), DUST_KIND.bulge, rand() ** 1.5);
  }
  for (let i = 0; i < field; i++) {
    const r = GALAXY.outer * 1.12 * Math.sqrt(rand());
    const a = rand() * 2 * Math.PI;
    put(r * Math.cos(a), gaussian(rand) * 0.8, r * Math.sin(a), DUST_KIND.field, rand() ** 3);
  }
  return { positions, kind, brightness };
}
