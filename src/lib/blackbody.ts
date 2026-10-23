/* The color of a star at a given temperature: Planck's law integrated against the CIE 1931 2°
   color-matching functions, converted to sRGB (D65) and scaled so the brightest channel is 1.

   The color-matching functions use the multi-lobe Gaussian fit of Wyman, Sloan and Shirley,
   "Simple Analytic Approximations to the CIE XYZ Color Matching Functions" (JCGT 2(2), 2013).
   The result matches Mitchell Charity's blackbody color table (bbr_color.txt, 2001, CIE 1931 2°,
   sRGB; http://www.vendian.org/mncharity/dir3/blackbody/) to a few steps per channel;
   blackbody.test.ts checks it at five temperatures. */

const H = 6.62607015e-34;
const C = 2.99792458e8;
const K = 1.380649e-23;

function lobe(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/** CIE 1931 2° observer, analytic fit; wavelength in nm. */
export function cie(nm: number): [number, number, number] {
  const x = 1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** Spectral radiance of a blackbody (relative units). */
function planck(nm: number, kelvin: number): number {
  const l = nm * 1e-9;
  return 1 / (l ** 5 * (Math.exp((H * C) / (l * K * kelvin)) - 1));
}

/** Linear sRGB of a blackbody at `kelvin`, brightest channel 1, no negative channels. */
export function blackbodyLinear(kelvin: number): [number, number, number] {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let nm = 380; nm <= 780; nm += 5) {
    const p = planck(nm, kelvin);
    const [x, y, z] = cie(nm);
    X += p * x;
    Y += p * y;
    Z += p * z;
  }
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const rgb = [r, g, b].map((v) => Math.max(0, v));
  const max = Math.max(...rgb);
  return [rgb[0] / max, rgb[1] / max, rgb[2] / max];
}

const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** The blackbody color as an sRGB hex string. */
export function blackbodyHex(kelvin: number): string {
  return `#${blackbodyLinear(kelvin)
    .map((c) => Math.round(encode(c) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * A blackbody color with its saturation raised by `k` around its own luminance, then rescaled so
 * the brightest channel is 1. Between about 5,000 K and 10,000 K a true blackbody reads as white
 * on screen; stars and the legend use this so the temperature stays visible.
 */
export function vivid(rgb: readonly [number, number, number], k = 1.9): [number, number, number] {
  const L = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const out = rgb.map((c) => Math.max(0, L + (c - L) * k));
  const max = Math.max(...out);
  return [out[0] / max, out[1] / max, out[2] / max];
}

/** The star color the universe draws for a temperature (linear RGB). */
export function starColor(kelvin: number): [number, number, number] {
  return vivid(blackbodyLinear(kelvin));
}

/** The same color as an sRGB hex string (the legend's spectrum strip). */
export function starHex(kelvin: number): string {
  return `#${starColor(kelvin)
    .map((c) => Math.round(encode(c) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}
