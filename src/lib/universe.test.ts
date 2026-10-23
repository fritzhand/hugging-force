import { describe, expect, it } from "vitest";
import catalog from "../data/catalog.json";
import { RELATIONS, type Catalog } from "../data/types.ts";
import { orbitPosition } from "./kepler.ts";
import { TAIL, bodyPosition, buildNamed, buildOrbits, buildStars, systemScale } from "./universe.ts";

const data = catalog as Catalog;
const stars = buildStars(data);

describe("universe", () => {
  it("makes one star per model, in catalog order", () => {
    expect(stars.map((s) => s.id)).toEqual(data.systems.map((s) => s.id));
    for (const s of stars) {
      expect(s.color.every((c) => c >= 0 && c <= 1)).toBe(true);
      expect(s.glow).toBeGreaterThanOrEqual(0);
      expect(s.glow).toBeLessThanOrEqual(1);
    }
  });

  it("puts one body in orbit for every derivative the Hub lists", () => {
    const orbits = buildOrbits(data, stars);
    let expected = 0;
    for (const s of data.systems) for (const r of RELATIONS) expected += s.tree[r].count * (r === "merge" ? 1 + TAIL : 1);
    expect(orbits.count).toBe(expected);
    const heads = new Map<number, number>();
    for (let i = 0; i < orbits.count; i++) {
      if (orbits.meta[i * 4 + 3] !== 0) continue;
      const system = orbits.meta[i * 4 + 1];
      heads.set(system, (heads.get(system) ?? 0) + 1);
    }
    data.systems.forEach((s, i) => expect(heads.get(i) ?? 0).toBe(RELATIONS.reduce((a, r) => a + s.tree[r].count, 0)));
  });

  it("is the same on every build", () => {
    const a = buildOrbits(data, stars);
    const b = buildOrbits(data, buildStars(data));
    expect(Array.from(a.orbit.slice(0, 400))).toEqual(Array.from(b.orbit.slice(0, 400)));
  });

  it("names the catalog's top members and places them like the GPU does", () => {
    const named = buildNamed(data, stars);
    const total = data.systems.reduce((a, s) => a + RELATIONS.reduce((b, r) => b + s.tree[r].top.length, 0), 0);
    expect(named.length).toBe(total);
    const b = named[0];
    const center = stars[b.system].pos;
    // Untilted, the frame matches lib/kepler.ts; tilted, the distance from the star is the same.
    const p = bodyPosition(b, 7.5, center);
    const ref = orbitPosition(b.orbit, 7.5);
    expect(Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])).toBeCloseTo(Math.hypot(...ref), 5);
  });

  it("grows a system with its family", () => {
    expect(systemScale(44000)).toBeGreaterThan(systemScale(100));
    expect(systemScale(0)).toBeCloseTo(1.1);
  });
});
