import { describe, expect, it } from "vitest";
import { blackbodyHex, blackbodyLinear } from "./blackbody.ts";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("blackbody", () => {
  // Mitchell Charity, bbr_color.txt (2001), CIE 1931 2° rows.
  const charity: [number, string][] = [
    [2300, "#ff9d33"],
    [3000, "#ffb969"],
    [3500, "#ffc987"],
    [6500, "#fff9fb"],
    [10000, "#cfdaff"],
  ];
  it.each(charity)("matches the published color at %i K", (kelvin, hex) => {
    const ours = rgb(blackbodyHex(kelvin));
    rgb(hex).forEach((c, i) => expect(Math.abs(ours[i] - c)).toBeLessThanOrEqual(6));
  });

  it("runs red to blue as the temperature rises", () => {
    const blueShare = (k: number) => {
      const [r, , b] = blackbodyLinear(k);
      return b / r;
    };
    expect(blueShare(3000)).toBeLessThan(blueShare(5800));
    expect(blueShare(5800)).toBeLessThan(blueShare(12000));
    expect(blueShare(12000)).toBeLessThan(blueShare(30000));
  });

  it("keeps the brightest channel at 1", () => {
    for (const k of [2000, 4000, 7000, 20000]) expect(Math.max(...blackbodyLinear(k))).toBeCloseTo(1, 6);
  });
});
