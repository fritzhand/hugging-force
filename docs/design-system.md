# Warm Cosmos: the Hugging Force design system

Hugging Face's yellow and orange as starlight on a deep violet night. The page is a dark sky, the
universe is lit by the brand, and every control sits on glass over it.

## One source of truth

`design/hugging-force.tokens.json` holds every token in the
[Design Tokens Format 2025.10](https://www.designtokens.org/tr/2025.10/format/) (`$value`, `$type`,
`$description`; colors as `{ colorSpace, components, alpha, hex }`; aliases in braces).
`npm run tokens` writes:

- `src/styles/tokens.css`: one custom property per token (`--color-hf-yellow`, `--space-4`,
  `--easing-orbit`...);
- `src/design/tokens.ts`: every color as a string, for the 3D scene.

Both are generated; `npm run build` fails when they are out of date, and `tokens.test.ts` checks
contrast. Change a value in the tokens file, never in the generated files or as a literal in CSS.

## Color

| Role | Tokens | Use |
|---|---|---|
| Brand light | `hf.yellow #ffd21e`, `hf.orange #ff9d00` | Calls to action (with `ink.onAccent`), the Hub's glow, the mark, the headline's last word, focus rings. Published at huggingface.co/brand |
| Sky | `sky.deep #07060b`, `sky.base #0c0a12`, `sky.raised` | The page and the universe |
| Surfaces | `surface.1-3`, `surface.glass` | Cards, panels, controls (glass panels blur what is behind them) |
| Ink | `ink.primary #f6f1e7` (starlight), `ink.secondary`, `ink.muted`, `ink.onAccent #1a1200` | Text: all 4.5:1 or more on every surface; ink on yellow 12.8:1, on orange 8.9:1 |
| Arms | `arm.nlp #c98500`, `arm.cv #d55181`, `arm.audio #008300`, `arm.multimodal #9085e9` | The four modalities: swatches, dust, icons. Never text |
| Orbits | `orbit.quantized #ffcca1` → `adapter #ffa245` → `finetune #e38305` → `merge #bd6c01` | The model tree's families, inside out |
| Nebula | `nebula.rose`, `nebula.violet`, `nebula.amber` | Decoration in the sky only |

**The arms** are a categorical set from the data-visualization reference palette, checked on the
dark sky with every pair compared (any two arms can sit side by side): lightness band and chroma
pass, normal-vision separation 19.3 (floor 15), color-blind separation 6.9 (protanopia, between
Language and Audio). That is in the 6 to 8 band that is legal only with a second cue, so every arm
always shows its name and an icon (Languages, Eye, AudioLines, Blend).

**The orbit families** are ordinal (inside out by how far a derivative moves from its base's
weights), so they share one hue: orange at 62°, lightness 0.88 to 0.61, validated as an ordinal ramp
(monotone, steps of 0.06 or more, 4.97:1 at the darkest). Each family also has its own shape (belt,
ring, planets, comets) and name.

**Star colors** are physical: blackbody colors from 3,000 K to 30,000 K (docs/universe.md), with a
spectral class and a number in the panel, so color never carries the trending score alone.

## Type

| Family | Token | Use |
|---|---|---|
| Bricolage Grotesque | `font.family.display` | Headings and the wordmark: heavy (800) and tight (−0.04em) in the hero |
| Source Sans 3 | `font.family.body` | Text (17 px / 1.55), labels in the scene. Hugging Face's own |
| IBM Plex Mono | `font.family.mono` | Model ids, numbers, readouts, kickers. Hugging Face's own |

Sizes: micro 12, detail 14, body 17, lead 20, title 24, headings 30 to 46, display 46 to 104 (fluid
between the two). Model ids are always mono with the owner muted: `meta-llama/`**`Llama-3.1-8B-Instruct`**.

## Components

- **Buttons**: pills, 44 px tall or more. Primary: the yellow-to-orange gradient with ink text and a
  warm glow; glass: a bordered translucent pill. Icon buttons are 44 px circles.
- **Chips**: an arm's swatch, icon, name and count; pressed chips get a yellow border.
- **Cards**: `surface.1` with a faint top light, `radius.l`, lifting 2 px on hover with a yellow edge.
- **Readouts**: a mono label in capitals over a mono value (`DOWNLOADS · 30 DAYS` / `4.86 M`).
- **Star glyph**: a model's star in miniature (its temperature's color, its core and glow), beside
  its name in cards and lists.
- **Family glyphs**: the belt, ring, planets and comet, drawn as icons in the family's color.
- **The panel**: glass, a sidebar on wide screens and a bottom sheet on narrow ones. It can be put
  away (it slides off its edge and becomes inert) to give the universe the whole screen; a pill that
  names the selection brings it back, and the choice is remembered per viewer.
- **Labels in the scene**: DOM text with a dark halo; names in Source Sans, owners in mono, arms in
  spaced capitals, the Hub in gold. Labels never overlap and never sit under the HUD.
- **The mark**: a two-armed spiral galaxy whose arms hold its core: the hug in the name
  (`components/Mark.tsx`, `public/favicon.svg`). It is not Hugging Face's logo.

## Motion

`duration.quick 120ms`, `base 200ms`, `slow 360ms`, `flight 1600ms`; `easing.orbit` settles like a
body falling into orbit. Camera flights ease in and out and rise when crossing the galaxy. Under
`prefers-reduced-motion`, nothing moves by itself: no drift, no orbits, no flights, no smooth scroll.

## Accessibility

- Contrast is tested (`tokens.test.ts`): text 4.5:1 or more on every surface, marks 3:1 or more.
- Color is never the only cue: arms have names and icons, families shapes and names, stars numbers.
- Everything in the canvas is reachable without it: the catalog on the landing page, the list and
  search in the universe, all by keyboard (`/` searches, Esc closes the legend, then the system).
- 44 px touch targets, visible focus rings, a skip link, landmarks, and a list when WebGL 2 is missing.
