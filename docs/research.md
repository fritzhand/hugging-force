# Research notes

A short survey made before building the proof of concept (October 2026): what Hugging Face's data
offers, what open astronomy has already standardized, what open-source 3D projects do, and which
design sources fit. Each section ends with what Hugging Force took from it.

## 1. The reference: portfolio-map-3d and the Nexus

[portfolio-map-3d](https://github.com/fritzhand/portfolio-map-3d) publishes an organization's
companies as a 3D globe and a walkable world; its Nexus (wearenexus.xyz) draws every map in its
network as a planet around a glowing core.

**Taken:** the engineering habits, rewritten for this project: an imperative three.js engine that
React drives only on events; rendering on demand; CPU-backed canvases for every texture and a
WebGL context-loss watch; DOM labels kept apart by priority; a HUD that tells the engine which part
of the screen it covers; the address as the state; a data file written by a script and checked by a
strict validator before every build; nothing invented.
**Left:** its look. The Nexus is zinc and cyan around a crystal core; Hugging Force is warm, a
spiral galaxy, and has its own type and tokens.

## 2. Hugging Face's data

- **Hub API** (`https://huggingface.co/api/models`). `expand[]` returns exactly the fields asked
  for: `downloads` (last 30 days), `downloadsAllTime`, `likes`, `trendingScore`, `pipeline_tag`,
  `library_name`, `createdAt`, `safetensors` (parameter counts), `gated`, `cardData`, `tags`. It is
  public, needs no token for these fields, and answers browsers (it reflects the `Origin` in
  `Access-Control-Allow-Origin`), so a live mode is possible later.
- **The model tree.** A model card's `base_model` names its base; the Hub infers the relation
  (`adapter`, `merge`, `quantized`, `finetune`) or takes `base_model_relation`
  ([model card docs](https://huggingface.co/docs/hub/model-cards#specifying-a-base-model)). Each model
  then carries the tags `base_model:<id>` and `base_model:<relation>:<id>`, with canonical (renamed)
  ids. Listing `filter=base_model:<relation>:<id>` and following the `Link` header's cursor counts a
  family; there is no total-count header. Checked against Llama 3.1 8B Instruct's model page: 3,290
  fine-tunes, 934 quantizations and 105 merges on both.
- **Task taxonomy.** [`pipelines.ts`](https://github.com/huggingface/huggingface.js/blob/main/packages/tasks/src/pipelines.ts)
  in huggingface.js gives every pipeline tag a display name and one of seven modalities
  (multimodal, nlp, cv, audio, tabular, rl, other). Copied to `data/tasks.json` (57 tasks).
- **Dates.** Repositories older than the Hub's 2022 migration all report `createdAt`
  `2022-03-02T23:29:0xZ`, so their true age is not in the API.
- **Brand.** [huggingface.co/brand](https://huggingface.co/brand) publishes `#FFD21E`, `#FF9D00` and
  `#6B7280` and the logo files. The site's stylesheet uses Source Sans Pro and IBM Plex Mono (and
  Charter for long reads).
- **What surfaces by downloads.** The most downloaded members of a family include uncensored,
  "abliterated" and adult models; the Hub flags some as `not-for-all-audiences`.

**Taken:** the snapshot script and its fields; the four relations as four orbit families, counted
exhaustively; HF's modalities as arms (the four with most models); legacy repositories in a bulge
"before March 2022" rather than a false date; the brand colors as light and the brand's families
for text; a filter on what the page names, while every count stays the Hub's.

## 3. Open astronomy

- **Open Exoplanet Catalogue** (Rein, [arXiv:1211.7121](https://arxiv.org/abs/1211.7121)): a
  community catalog kept as one XML file per system, hierarchical (system, star, planet, binaries),
  versioned in git so anyone can fork it and still pull updates.
- **IVOA standards**: [VOTable](https://www.ivoa.net/documents/VOTable/) for tabular data with
  units and semantic tags (UCDs); [HiPS](https://www.ivoa.net/documents/HiPS/) (Hierarchical
  Progressive Surveys, from CDS's Aladin) for sky data served as HEALPix tiles at increasing
  resolution; MOC for coverage maps.
- **Orbital mechanics**: six Keplerian elements describe an orbit; Kepler's equation
  `M = E − e·sin E` places a body in time; the third law ties period to `a^1.5`.
- **Star colors**: Mitchell Charity's [blackbody color table](http://www.vendian.org/mncharity/dir3/blackbody/)
  (CIE 1931 and 1964 observers, sRGB); the analytic CIE fit of Wyman, Sloan and Shirley (JCGT, 2013).
  Real stars differ somewhat from blackbodies (Harre and Heller, "Digital color codes of stars",
  [arXiv:2101.06254](https://arxiv.org/abs/2101.06254)), which matters little at this scale.
- **Brightness and classes**: Pogson's magnitude scale (five magnitudes = a factor of 100);
  Morgan-Keenan spectral classes O, B, A, F, G, K, M by temperature.
- **Spiral arms**: logarithmic spirals with pitch angles of roughly 10° to 40°; bulges of older
  stars, arms of younger ones.

**Taken:** the catalog's shape (systems of a star and what orbits it, one file, rebuilt by a script,
versioned); Keplerian orbits solved on the GPU; blackbody colors checked against Charity's table;
magnitudes and spectral classes in the panel; logarithmic arms; a bulge for the oldest models.
**Kept for later:** HiPS's idea of progressive tiles is the way to draw the whole Hub (two million
models) without loading it at once; VOTable is a natural export for the catalog.

## 4. Open-source 3D and sky software

- [3d-force-graph](https://github.com/vasturiano/3d-force-graph) (MIT): force-directed graphs in
  three.js; bloom through three's `UnrealBloomPass`.
- [Stellarium](https://github.com/Stellarium/stellarium) (GPL-2.0, C++ and OpenGL) and Stellarium
  Web, a planetarium in the browser; [OpenSpace](https://github.com/OpenSpace/OpenSpace) (C++),
  astrovisualization for planetariums.
- Smaller three.js projects: Solar Wanderer (JPL ephemerides in WebGL2), Galaxy Explorer (a
  procedural Milky Way, under a non-commercial license), several galaxy generators and portfolio
  "galaxies".

**Taken:** ideas only, no code: procedural arms of particles, additive light, diffraction spikes,
orbits computed in shaders, and a planetarium's habit of labeling only what fits. Hugging Force's
code is original and depends only on three.js, React and lucide icons; it uses no post-processing
pass (the glow is in the shaders), so it stays light on phones.

## 5. Design

- **Design Tokens Format 2025.10** ([designtokens.org](https://www.designtokens.org/tr/2025.10/format/)),
  the Design Tokens Community Group's first stable version (October 28, 2025; a community group
  report, not a W3C standard): `$value`, `$type`, `$description`, aliases in braces, colors as
  `{ colorSpace, components, alpha, hex }`, dimensions as `{ value, unit }`.
- **Color for data**: the data-visualization method bundled with Claude Code: categorical palettes
  checked for lightness band, chroma, color-blind separation (Machado 2009 simulation), a
  normal-vision floor and contrast; ordinal ramps checked for one hue and monotone lightness.
- **Type**: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) (OFL), a
  warm grotesque with optical sizes; Source Sans 3 and IBM Plex Mono (OFL), Hugging Face's own.

**Taken:** one tokens file in that format generates the CSS and the scene's colors; the four arm
colors are one of the two four-hue sets of the reference palette that pass the all-pairs checks on
the dark sky (color-blind separation 6.9, in the band that requires labels, which every arm has); the
orbit families use one orange ramp, validated as ordinal; HF's families for text and model ids,
Bricolage for display.

## Next steps

- **The whole Hub.** Stream stars by arm and year in progressive tiles (the HiPS idea) and show
  the rest of each family as density until a system is selected.
- **Datasets as nebulae** (a model card's `datasets` field: where stars form) and **Spaces as
  stations** orbiting the models they run.
- **A Hugging-Russell diagram**: the same stars animated into a chart of size against downloads.
- **Live mode**: refresh numbers from the Hub API in the browser; a time-lapse of the galaxy's growth.
