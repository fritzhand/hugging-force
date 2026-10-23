/* How a model becomes a star: each encoding as a pure function, with fixed ranges so a star keeps
   its look from one snapshot to the next. docs/universe.md explains the choices.

   - size        parameters (log scale)
   - glow        downloads in the last 30 days (log scale), also given as an apparent magnitude
   - temperature the Hub's trending score (log scale), drawn as the color of a blackbody */

export const RANGE = {
  /** 10 million to 1 trillion parameters. */
  parameters: [1e7, 1e12],
  /** 1 thousand to 300 million downloads in 30 days. */
  downloads: [1e3, 3e8],
  /** A trending score of 0 to 1,000. */
  trending: [0, 1000],
  /** 3,000 K (a cool red-orange star) to 30,000 K (a hot blue one). */
  kelvin: [3000, 30000],
  /** A star's core radius, in world units. */
  radius: [0.1, 0.32],
} as const;

/** Where `v` sits between `lo` and `hi` on a log scale, clamped to [0, 1]. */
export function logUnit(v: number, lo: number, hi: number): number {
  if (!(v > 0)) return 0;
  const t = (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return Math.min(1, Math.max(0, t));
}

/** A star's core radius from its parameter count. Unknown counts get the middle size. */
export function starRadius(parameters: number | null): number {
  const [r0, r1] = RANGE.radius;
  const t = parameters === null ? 0.5 : logUnit(parameters, RANGE.parameters[0], RANGE.parameters[1]);
  return r0 + (r1 - r0) * t;
}

/** A star's glow, 0 to 1, from its downloads in the last 30 days. */
export function starGlow(downloads: number): number {
  return logUnit(Math.max(downloads, 1), RANGE.downloads[0], RANGE.downloads[1]);
}

/**
 * Apparent magnitude on Pogson's scale, from downloads in the last 30 days: a million downloads is
 * magnitude 0, and every 2.512 times more is one magnitude brighter (a lower number).
 */
export function magnitude(downloads: number): number {
  return -2.5 * Math.log10(Math.max(downloads, 1) / 1e6);
}

/** A star's temperature in kelvin from the Hub's trending score. */
export function temperature(trendingScore: number): number {
  const [k0, k1] = RANGE.kelvin;
  const s = Math.max(0, trendingScore);
  const t = Math.min(1, Math.log10(1 + s) / Math.log10(1 + RANGE.trending[1]));
  return k0 * (k1 / k0) ** t;
}

export type SpectralClass = "O" | "B" | "A" | "F" | "G" | "K" | "M";

/** The Morgan-Keenan class of a temperature (the usual boundaries, in kelvin). */
export function spectralClass(kelvin: number): SpectralClass {
  if (kelvin >= 30000) return "O";
  if (kelvin >= 10000) return "B";
  if (kelvin >= 7500) return "A";
  if (kelvin >= 6000) return "F";
  if (kelvin >= 5200) return "G";
  if (kelvin >= 3700) return "K";
  return "M";
}

/** The classes in order, hottest first, with the lowest temperature of each (for the legend). */
export const SPECTRAL_CLASSES: readonly [SpectralClass, number][] = [
  ["O", 30000],
  ["B", 10000],
  ["A", 7500],
  ["F", 6000],
  ["G", 5200],
  ["K", 3700],
  ["M", 2400],
];
