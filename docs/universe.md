# The universe protocol

How a model on the Hugging Face Hub becomes a star, and its model tree becomes what orbits it.
Every encoding is a pure function in `src/lib/` with fixed ranges, so a star keeps its look from one
snapshot to the next, and every one is unit-tested.

## The catalog

`src/data/catalog.json` (format `hugging-force/catalog@1`) holds systems, each a model with what is
built on it, the same shape as the [Open Exoplanet Catalogue](https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue)'s
system → star → planets, in one file, versioned in git and rebuilt from public data by one script
(`scripts/fetch-catalog.mjs`).

| Field | From the Hub API | Notes |
|---|---|---|
| `id`, `author` | `id`, `author` | |
| `task`, `taskName`, `modality` | `pipeline_tag`, then `data/tasks.json` | The Hub's task taxonomy (huggingface.js `PIPELINE_DATA`) |
| `library`, `license`, `gated` | `library_name`, `cardData.license` (or the `license:` tag), `gated` | |
| `createdAt` | `createdAt` | Repositories older than March 2022 all carry `2022-03-02T23:29:0xZ` |
| `parameters` | `safetensors.total` | `null` when the Hub reports none |
| `downloads`, `downloadsAllTime`, `likes`, `trendingScore` | the same names | `downloads` covers the last 30 days |
| `parents` | tags `base_model:<relation>:<id>` | The Hub's canonical ids |
| `tree.<relation>.count` | every page of `/api/models?filter=base_model:<relation>:<id>` | `quantized`, `adapter`, `finetune`, `merge` |
| `tree.<relation>.top` | the first page, sorted by downloads | Up to five, skipping models marked `not-for-all-audiences` and names that advertise adult content or removed safety tuning, and ids in `data/curated.json`'s `unnamed` |

`src/data/validate.ts` checks it before every build: a strict key whitelist, types and ranges, known
modalities and relations, Hub-shaped ids, unique ids, no more named members than the count, and no
date after the snapshot.

## Where a star stands (`lib/galaxy.ts`)

The galaxy lies in the x-z plane, y up.

- **Arms.** Each of four modalities owns a logarithmic spiral, the shape of real spiral arms:
  `θ_k(r) = 0.6 + k·π/2 + ln(r / 11) / tan(22°)`, for arm `k` in the order Language, Vision, Audio,
  Multimodal. A 22° pitch is within the 10° to 40° of real spiral galaxies.
- **Distance is time.** The arms start at `r = 11` on March 1, 2022 and end at `r = 54` on the
  snapshot's date: `r = 11 + 43 · (t − Mar 2022) / (snapshot − Mar 2022)`. Equal distances are equal
  times, and each January 1 is drawn as a faint ring.
- **The bulge.** A repository created before March 3, 2022 shows the Hub's migration date, not its
  own; its true age is unknown, so it sits in the bulge, at `r` between 3.4 and 8.2 (by a hash of its id).
- **Spacing.** Stars keep at least 4.4 units apart. Neighbors move only around the core (within
  0.42 rad of their arm, 1.3 rad in the bulge) and above or below the disc, never in or out: their
  distance is their date.

## How a star looks (`lib/scales.ts`, `lib/blackbody.ts`)

With `u(v, lo, hi)` the position of `v` between `lo` and `hi` on a log scale, clamped to [0, 1]:

| Property | Formula | Range |
|---|---|---|
| Core radius | `0.10 + 0.22 · u(parameters, 1e7, 1e12)`; 0.21 when not reported | 10 M to 1 T parameters |
| Glow | `u(downloads, 1e3, 3e8)` sets the halo's size and the diffraction spikes (from 0.45 up) | 1 k to 300 M downloads in 30 days |
| Apparent magnitude | `m = −2.5 · log10(downloads / 1e6)` (Pogson's scale; a million downloads is magnitude 0, lower is brighter) | |
| Temperature | `T = 3000 K · 10^t`, `t = min(1, log10(1 + trending) / log10(1001))` | 3,000 K at 0 to 30,000 K at 1,000 or more |
| Spectral class | Morgan-Keenan: O ≥ 30,000 K, B ≥ 10,000, A ≥ 7,500, F ≥ 6,000, G ≥ 5,200, K ≥ 3,700, else M | |
| Color | The blackbody color at `T`: Planck's law integrated against the CIE 1931 2° color-matching functions (the analytic fit of Wyman, Sloan and Shirley, 2013), converted to sRGB, brightest channel 1; then saturation × 1.9 around its luminance so 5,000 K to 10,000 K stars do not all read as white | |

The blackbody colors match Mitchell Charity's table (bbr_color.txt, CIE 1931 2°) within a few steps
per channel at 2,300, 3,000, 3,500, 6,500 and 10,000 K (`blackbody.test.ts`).

## What orbits a star (`lib/kepler.ts`, `lib/universe.ts`)

One body per model the Hub lists in the star's model tree. A system's scale grows with its family:
`s = 1.1 + u(derivatives + 1, 10, 50000)`. Its orbits lie in its own plane, tilted 0.12 to 0.62 rad
around an axis in the disc (by a hash of its id).

Each body has Keplerian elements: semi-major axis `a`, eccentricity `e`, inclination `i`, longitude
of the ascending node, argument of periapsis and mean anomaly at t = 0, drawn from a generator seeded
by the model's id and the family. The vertex shader solves Kepler's equation `M = E − e·sin E` by
Newton's method each frame; `lib/kepler.ts` does the same on the CPU for the named bodies. The mean
motion follows Kepler's third law: `n = (2π / 30 s) · a^−1.5`.

The families, inside out by how far a derivative moves from its base's weights:

| Family | Shape | `a / s` | `e` | `i` | Color |
|---|---|---|---|---|---|
| Quantizations | A thin belt | 0.34 to 0.46 | 0 to 0.03 | 0° to 1.5° | `#ffcca1` |
| Adapters | A flat ring | 0.52 to 0.66 | 0 to 0.008 | 0° to 0.4° | `#ffa245` |
| Fine-tunes | Planets on inclined orbits | 0.72 to 1.0 | 0 to 0.1 | 0° to 9° | `#e38305` |
| Merges | Comets on long, eccentric orbits; each tail (six points) points away from the star, longer near periapsis | 0.7 to 1.05 | 0.45 to 0.75 | 0° to 50° | `#bd6c01` |

The five most downloaded members of each family are also drawn as larger bodies in a selected
system, labeled, with their numbers in the panel.

## Lineage

When a model's base model (`parents`) is also a star in the catalog, a gold arc joins them (today:
whisper-large-v3 and whisper-large-v3-turbo). No other line joins two stars: nearness in the galaxy
means the same modality and a similar date, nothing more.

## What is decoration

The sky's nebulae, the far stars and the galaxy's dust are decoration, not data: the dust traces the
arms (tinted in their colors) and the bulge, and is denser toward the core. Year rings and arm names
are guides.
