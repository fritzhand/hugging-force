import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { COLOR } from "./tokens.ts";

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const SURFACES = [COLOR.sky.deep, COLOR.sky.base, COLOR.sky.raised, COLOR.surface[1], COLOR.surface[2], COLOR.surface[3]];

describe("design tokens", () => {
  it("are generated from the tokens file (npm run tokens)", () => {
    expect(() => execFileSync("node", ["scripts/build-tokens.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("keep every text color at 4.5:1 or more on every surface", () => {
    for (const ink of [COLOR.ink.primary, COLOR.ink.secondary, COLOR.ink.muted, COLOR.hf.yellow])
      for (const bg of SURFACES) expect(contrast(ink, bg), `${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("keep text on the calls to action readable", () => {
    expect(contrast(COLOR.ink.onAccent, COLOR.hf.yellow)).toBeGreaterThanOrEqual(7);
    expect(contrast(COLOR.ink.onAccent, COLOR.hf.orange)).toBeGreaterThanOrEqual(4.5);
  });

  it("keep the arm and family marks at 3:1 or more on the sky and panels", () => {
    for (const mark of [...Object.values(COLOR.arm), ...Object.values(COLOR.orbit)])
      for (const bg of [COLOR.sky.deep, COLOR.sky.base, COLOR.surface[1]]) expect(contrast(mark, bg), `${mark} on ${bg}`).toBeGreaterThanOrEqual(3);
  });

  it("keep Hugging Face's brand colors as published", () => {
    expect(COLOR.hf).toEqual({ yellow: "#ffd21e", orange: "#ff9d00", gray: "#6b7280" });
  });
});
