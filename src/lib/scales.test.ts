import { describe, expect, it } from "vitest";
import { RANGE, logUnit, magnitude, spectralClass, starGlow, starRadius, temperature } from "./scales.ts";

describe("scales", () => {
  it("places values on a clamped log scale", () => {
    expect(logUnit(10, 1, 100)).toBeCloseTo(0.5);
    expect(logUnit(0.1, 1, 100)).toBe(0);
    expect(logUnit(1e9, 1, 100)).toBe(1);
    expect(logUnit(0, 1, 100)).toBe(0);
  });

  it("grows a star with its parameters, and gives unknown counts the middle size", () => {
    expect(starRadius(1e7)).toBeCloseTo(RANGE.radius[0]);
    expect(starRadius(1e12)).toBeCloseTo(RANGE.radius[1]);
    expect(starRadius(8e9)).toBeGreaterThan(starRadius(1e8));
    expect(starRadius(null)).toBeCloseTo((RANGE.radius[0] + RANGE.radius[1]) / 2);
  });

  it("brightens with downloads", () => {
    expect(starGlow(0)).toBe(0);
    expect(starGlow(193e6)).toBeGreaterThan(starGlow(4.8e6));
    expect(starGlow(1e9)).toBe(1);
  });

  it("follows Pogson's magnitude scale", () => {
    expect(magnitude(1e6)).toBeCloseTo(0);
    expect(magnitude(1e8)).toBeCloseTo(-5);
    expect(magnitude(1e4)).toBeCloseTo(5);
    // 2.512 times the downloads is one magnitude brighter.
    expect(magnitude(2.512e6)).toBeCloseTo(-1, 2);
  });

  it("heats up with the trending score, from 3,000 K to 30,000 K", () => {
    expect(temperature(0)).toBeCloseTo(3000);
    expect(temperature(1000)).toBeCloseTo(30000);
    expect(temperature(5000)).toBeCloseTo(30000);
    expect(temperature(56)).toBeGreaterThan(temperature(5));
    expect(temperature(-3)).toBeCloseTo(3000);
  });

  it("names the spectral class", () => {
    expect(spectralClass(30000)).toBe("O");
    expect(spectralClass(11500)).toBe("B");
    expect(spectralClass(8000)).toBe("A");
    expect(spectralClass(6500)).toBe("F");
    expect(spectralClass(5500)).toBe("G");
    expect(spectralClass(4000)).toBe("K");
    expect(spectralClass(3000)).toBe("M");
  });
});
