/* How to read the universe: what each visual property means. The landing page shows it as cards,
   the universe as a compact panel. Every encoding is named in words; color is never the only cue. */
import { MODALITIES, RELATIONS } from "../data/types.ts";
import { starHex } from "../lib/blackbody.ts";
import { FAMILY, MODALITY } from "../lib/modality.ts";
import { RANGE, SPECTRAL_CLASSES, spectralClass, temperature } from "../lib/scales.ts";
import { ArmIcon, FamilyGlyph } from "./Icons.tsx";

/** Position (0-1) of a trending score on the color scale. */
const scorePos = (s: number) => Math.log10(1 + s) / Math.log10(1 + RANGE.trending[1]);

function Spectrum() {
  const stops = Array.from({ length: 11 }, (_, i) => {
    const s = 10 ** ((i / 10) * Math.log10(1 + RANGE.trending[1])) - 1;
    return `${starHex(temperature(s))} ${i * 10}%`;
  });
  // A class's band on the bar: where its lowest and highest temperatures fall (log scale, as the bar).
  const [k0, k1] = RANGE.kelvin;
  const at = (k: number) => Math.min(1, Math.max(0, Math.log(k / k0) / Math.log(k1 / k0)));
  const classes = SPECTRAL_CLASSES.map(([c, lo], i) => {
    const hi = i === 0 ? k1 * 2 : SPECTRAL_CLASSES[i - 1][1];
    const a = at(Math.max(lo, k0));
    const b = at(hi);
    return { c, mid: c === "O" ? 1 : (a + b) / 2 };
  });
  return (
    <div className="spectrum">
      <div className="spectrum-classes" aria-hidden="true">
        {classes.map(({ c, mid }) => (
          <span key={c} style={{ left: `${mid * 100}%` }}>
            {c}
          </span>
        ))}
      </div>
      <div className="spectrum-bar" style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }} />
      <div className="spectrum-ticks" aria-hidden="true">
        {[0, 10, 100, 1000].map((s) => (
          <span key={s} style={{ left: `${scorePos(s) * 100}%` }}>
            {s === 1000 ? "1,000+" : s}
          </span>
        ))}
      </div>
      <p className="sr-only">
        Trending score 0 is a class {spectralClass(temperature(0))} star at {RANGE.kelvin[0].toLocaleString("en-US")} K; a score of 1,000 or more is class O at {RANGE.kelvin[1].toLocaleString("en-US")} K.
      </p>
    </div>
  );
}

export function Legend({ variant }: { variant: "cards" | "compact" }) {
  const items = [
    {
      key: "arms",
      title: "Arms are modalities",
      body: "Hugging Face's four main modalities each own an arm of the galaxy.",
      art: (
        <ul className="legend-arms">
          {MODALITIES.map((m) => (
            <li key={m}>
              <span className="swatch" style={{ background: `var(--color-arm-${m})` }} />
              <ArmIcon arm={m} size={15} />
              {MODALITY[m].label}
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "time",
      title: "Distance is time",
      body: "The arms start in March 2022 and grow outward at a steady rate: each faint ring is a new year. Repositories older than that carry the Hub's 2022 migration date, so they wait in the bulge.",
      art: (
        <svg className="legend-art" viewBox="0 0 160 70" aria-hidden="true">
          {[14, 30, 46, 62].map((r) => (
            <ellipse key={r} cx="80" cy="35" rx={r * 1.15} ry={r * 0.42} fill="none" stroke="var(--color-ink-muted)" strokeOpacity={0.5} strokeDasharray="1.5 3" />
          ))}
          <circle cx="80" cy="35" r="5" fill="var(--color-hf-yellow)" />
          {["2023", "2024", "2025", "2026"].map((y, i) => (
            <text key={y} x={80 + [14, 30, 46, 62][i] * 1.15 + 1} y="38" fill="var(--color-ink-muted)" fontSize="7" fontFamily="var(--font-family-mono)">
              {i === 3 ? y : ""}
            </text>
          ))}
        </svg>
      ),
    },
    {
      key: "size",
      title: "Size is parameters",
      body: "A star's core grows with its parameter count, from millions to a trillion, on a log scale.",
      art: (
        <div className="legend-scale">
          {[
            ["100 M", 0.25],
            ["10 B", 0.6],
            ["1 T", 1],
          ].map(([label, k]) => (
            <span key={label as string}>
              <i style={{ width: `${6 + 14 * (k as number)}px`, height: `${6 + 14 * (k as number)}px` }} />
              {label}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "glow",
      title: "Brightness is downloads",
      body: "The more a model was downloaded in the last 30 days, the wider its glow. The panel also gives it as an apparent magnitude: a million downloads is magnitude 0, lower is brighter.",
      art: (
        <div className="legend-scale legend-glow">
          {[
            ["10 k", 0.2],
            ["1 M", 0.55],
            ["100 M", 1],
          ].map(([label, k]) => (
            <span key={label as string}>
              <i style={{ boxShadow: `0 0 ${4 + 18 * (k as number)}px ${1 + 5 * (k as number)}px rgb(255 236 200 / ${0.25 + 0.5 * (k as number)})` }} />
              {label}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "heat",
      title: "Color is trending",
      body: "The Hub's trending score sets a star's temperature, from 3,000 K to 30,000 K, and the star takes that temperature's color: hot blue-white stars are trending now, cooler orange ones have quieted. Letters are spectral classes; numbers are trending scores.",
      art: <Spectrum />,
    },
    {
      key: "tree",
      title: "Orbits are the model tree",
      body: "Every model the Hub lists as built on a star orbits it, one point each, inside out by how far it moves from its base.",
      art: (
        <ul className="legend-families">
          {RELATIONS.map((r) => (
            <li key={r}>
              <FamilyGlyph relation={r} size={22} />
              <span>
                <b>{FAMILY[r].many}</b> <em>{FAMILY[r].shape}</em>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return (
    <div className={`legend legend-${variant}`}>
      {items.map((it) => (
        <article key={it.key} className="legend-item">
          <div className="legend-visual">{it.art}</div>
          <h3>{it.title}</h3>
          <p>{it.body}</p>
        </article>
      ))}
    </div>
  );
}
