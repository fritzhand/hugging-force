import { describe, expect, it } from "vitest";
import { declutter, overlaps } from "./labels.ts";

const r = (l: number, t: number, w = 10, h = 10) => ({ l, t, r: l + w, b: t + h });

describe("labels", () => {
  it("detects overlap, not touching", () => {
    expect(overlaps(r(0, 0), r(5, 5))).toBe(true);
    expect(overlaps(r(0, 0), r(10, 0))).toBe(false);
  });

  it("keeps the higher priority when two labels collide", () => {
    const a = { rect: r(0, 0), priority: 1 };
    const b = { rect: r(4, 4), priority: 2 };
    const c = { rect: r(40, 40), priority: 0 };
    const shown = declutter([a, b, c], r(-100, -100, 400, 400), []);
    expect(shown.has(b)).toBe(true);
    expect(shown.has(a)).toBe(false);
    expect(shown.has(c)).toBe(true);
  });

  it("hides labels off screen or under a covered area", () => {
    const off = { rect: r(-20, 0), priority: 5 };
    const under = { rect: r(50, 50), priority: 5 };
    const free = { rect: r(10, 10), priority: 1 };
    const shown = declutter([off, under, free], r(0, 0, 100, 100), [r(45, 45, 30, 30)]);
    expect([...shown]).toEqual([free]);
  });
});
