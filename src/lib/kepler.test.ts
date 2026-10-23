import { describe, expect, it } from "vitest";
import { seeded } from "./hash.ts";
import { FAMILY_BANDS, eccentricAnomaly, familyOrbit, meanMotion, orbitPosition, perifocal, rotate, type Orbit } from "./kepler.ts";
import { RELATIONS } from "../data/types.ts";

const len = (v: number[]) => Math.hypot(...v);

describe("kepler", () => {
  it("solves Kepler's equation", () => {
    for (const e of [0, 0.1, 0.5, 0.85, 0.95]) {
      for (const M of [0, 0.3, 1, 2.5, 3.1, 5, 6.2]) {
        const E = eccentricAnomaly(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 9);
      }
    }
  });

  it("follows Kepler's third law", () => {
    const period = (a: number) => (2 * Math.PI) / meanMotion(a);
    expect(period(4) / period(1)).toBeCloseTo(8);
  });

  it("gives a unit, orthogonal perifocal frame", () => {
    const { P, Q } = perifocal({ i: 0.7, node: 1.3, peri: 2.1 });
    expect(len(P)).toBeCloseTo(1);
    expect(len(Q)).toBeCloseTo(1);
    expect(P[0] * Q[0] + P[1] * Q[1] + P[2] * Q[2]).toBeCloseTo(0);
  });

  it("keeps a flat orbit in the reference plane (y = 0)", () => {
    const o: Orbit = { a: 2, e: 0.3, i: 0, node: 0.4, peri: 1, M0: 0.2, n: meanMotion(2) };
    for (const t of [0, 3, 11]) expect(orbitPosition(o, t)[1]).toBeCloseTo(0);
  });

  it("is nearest at periapsis and farthest at apoapsis", () => {
    const o: Orbit = { a: 1, e: 0.6, i: 0.3, node: 0, peri: 0, M0: 0, n: meanMotion(1) };
    expect(len(orbitPosition(o, 0))).toBeCloseTo(0.4);
    expect(len(orbitPosition(o, Math.PI / o.n))).toBeCloseTo(1.6);
  });

  it("keeps every family inside its band", () => {
    const rand = seeded(42);
    for (const rel of RELATIONS) {
      const band = FAMILY_BANDS[rel];
      for (let k = 0; k < 200; k++) {
        const o = familyOrbit(rel, rand, 2);
        expect(o.a).toBeGreaterThanOrEqual(band.a[0] * 2 - 1e-9);
        expect(o.a).toBeLessThanOrEqual(band.a[1] * 2 + 1e-9);
        expect(o.e).toBeGreaterThanOrEqual(band.e[0]);
        expect(o.e).toBeLessThanOrEqual(band.e[1]);
        expect(o.e).toBeLessThan(1);
      }
    }
  });

  it("orders the families inside out", () => {
    expect(FAMILY_BANDS.quantized.a[1]).toBeLessThan(FAMILY_BANDS.adapter.a[0]);
    expect(FAMILY_BANDS.adapter.a[1]).toBeLessThan(FAMILY_BANDS.finetune.a[0]);
  });

  it("rotates around an axis", () => {
    const v = rotate([1, 0, 0], [0, 1, 0], Math.PI / 2);
    expect(v[0]).toBeCloseTo(0);
    expect(v[2]).toBeCloseTo(-1);
  });
});
