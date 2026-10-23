/* A model's star in miniature, as the universe draws it: its temperature's color, a core sized by
   its parameters and a halo by its downloads. Decorative: the text beside it says the same. */
import type { ModelSystem } from "../data/types.ts";
import { starHex } from "../lib/blackbody.ts";
import { RANGE, starGlow, starRadius, temperature } from "../lib/scales.ts";

export function StarGlyph({ system, size = 44 }: { system: ModelSystem; size?: number }) {
  const color = starHex(temperature(system.trendingScore));
  const core = (starRadius(system.parameters) - RANGE.radius[0]) / (RANGE.radius[1] - RANGE.radius[0]);
  const glow = starGlow(system.downloads);
  const c = size / 2;
  const coreR = size * (0.07 + 0.08 * core);
  const haloR = size * (0.24 + 0.24 * glow);
  const gid = `g-${system.id.replace(/[^A-Za-z0-9]/g, "-")}`;
  return (
    <svg className="star-glyph" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gid}>
          <stop offset="0" stopColor={color} stopOpacity="0.9" />
          <stop offset="0.45" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={haloR} fill={`url(#${gid})`} />
      {glow > 0.45 ? (
        <g stroke={color} strokeOpacity={0.55 * glow} strokeWidth="0.8">
          <line x1={c - haloR * 1.15} y1={c} x2={c + haloR * 1.15} y2={c} />
          <line x1={c} y1={c - haloR * 1.15} x2={c} y2={c + haloR * 1.15} />
        </g>
      ) : null}
      <circle cx={c} cy={c} r={coreR} fill="#fffaf0" />
      <circle cx={c} cy={c} r={coreR} fill={color} fillOpacity="0.35" />
    </svg>
  );
}
