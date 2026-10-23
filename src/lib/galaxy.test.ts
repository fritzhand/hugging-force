import { describe, expect, it } from "vitest";
import catalog from "../data/catalog.json";
import type { Catalog } from "../data/types.ts";
import { ARM_ORDER, GALAXY, armAngle, dust, isLegacy, placeStars, radiusOfTime, timeRadius, yearRings } from "./galaxy.ts";

const data = catalog as Catalog;
const FETCHED = "2026-10-23T00:00:00.000Z";

describe("galaxy", () => {
  it("maps time to distance from the core at a constant rate", () => {
    expect(radiusOfTime(Date.UTC(2022, 2, 1), FETCHED)).toBeCloseTo(GALAXY.inner);
    expect(radiusOfTime(Date.parse(FETCHED), FETCHED)).toBeCloseTo(GALAXY.outer);
    const a = radiusOfTime(Date.UTC(2023, 0, 1), FETCHED);
    const b = radiusOfTime(Date.UTC(2024, 0, 1), FETCHED);
    const c = radiusOfTime(Date.UTC(2025, 0, 1), FETCHED);
    expect(c - b).toBeCloseTo(b - a, 1);
  });

  it("puts repositories older than the Hub's dates in the bulge", () => {
    expect(isLegacy("2022-03-02T23:29:04.000Z")).toBe(true);
    expect(isLegacy("2022-03-03T10:00:00.000Z")).toBe(false);
    const r = timeRadius("2022-03-02T23:29:04.000Z", FETCHED, "google-bert/bert-base-uncased");
    expect(r).toBeLessThan(GALAXY.bulge);
    expect(timeRadius("2024-07-18T08:56:00.000Z", FETCHED, "x/y")).toBeGreaterThan(GALAXY.inner);
  });

  it("winds each arm as a logarithmic spiral", () => {
    const k = 1 / Math.tan(GALAXY.pitch);
    expect(armAngle(0, GALAXY.inner * Math.E) - armAngle(0, GALAXY.inner)).toBeCloseTo(k);
    expect(armAngle(1, 20) - armAngle(0, 20)).toBeCloseTo(Math.PI / 2);
  });

  it("places the catalog deterministically, apart, and at its dates", () => {
    const input = data.systems.map((s) => ({ id: s.id, modality: s.modality, createdAt: s.createdAt }));
    const a = placeStars(input, data.fetchedAt);
    const b = placeStars(input, data.fetchedAt);
    expect(a).toEqual(b);
    for (let i = 0; i < a.length; i++) {
      expect(Math.hypot(a[i].x, a[i].z)).toBeCloseTo(timeRadius(data.systems[i].createdAt, data.fetchedAt, a[i].id), 6);
      expect(a[i].arm).toBe(ARM_ORDER.indexOf(data.systems[i].modality));
      for (let j = i + 1; j < a.length; j++) {
        const d = Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y, a[i].z - a[j].z);
        expect(d, `${a[i].id} and ${a[j].id}`).toBeGreaterThan(GALAXY.minGap * 0.8);
      }
    }
  });

  it("draws a ring for each new year", () => {
    const rings = yearRings(FETCHED);
    expect(rings.map((r) => r.year)).toEqual([2023, 2024, 2025, 2026]);
    for (const r of rings) expect(r.r).toBeGreaterThan(GALAXY.inner);
  });

  it("makes the same dust every time", () => {
    const a = dust(100, 50, 50);
    const b = dust(100, 50, 50);
    expect(a.positions.length).toBe((100 * 4 + 100) * 3);
    expect(Array.from(a.positions.slice(0, 30))).toEqual(Array.from(b.positions.slice(0, 30)));
    expect(Math.max(...a.kind)).toBe(5);
  });
});
