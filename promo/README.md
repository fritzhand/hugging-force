# Promo video

A 30-second promo of Hugging Force in 16:9, made from the app's own universe engine.

| File (in `promo/out/`) | What it is |
|---|---|
| `hugging-force-promo-16x9.mp4` | 1920 × 1080, H.264 High 4.1, yuv420p, BT.709, 30 fps, CRF 18, `+faststart`; AAC 48 kHz stereo, 192 kb/s, −14 LUFS, true peak under −1 dBTP |
| `poster-16x9.png` / `.jpg` | The title card over the arriving galaxy (3.2 s) |
| `contact-16x9.png` | A frame every 2 s from 1 s, each labeled with its time |

## The cut

One continuous camera move through the real universe (`storyboard.mjs` has every time):

| Time | Shot | On screen |
|---|---|---|
| 0–5 s | Out of deep space toward the galaxy | The title card |
| 5–10 s | A sweep around the galaxy, its stars named | "Every star is a model on Hugging Face", the star count and the models in orbit; size, glow and color |
| 10–15.5 s | Down into FLUX.1-dev's system, the core behind it | "Everything built on a model orbits it", its adapter count |
| 15.5–20.5 s | Across the inner galaxy to Llama 3.1 8B Instruct | Its model tree: each family lights up in turn, with its count |
| 20.5–25.5 s | Out and over the galaxy | "Arms are modalities. Every ring is a year.": each arm lights up in turn |
| 25.5–30 s | The galaxy turning | The end card: huggingforce.com, the not-affiliated notice |

Every number on screen is read from `src/data/catalog.json` when the stage renders, so a cut shows
the snapshot it was made from. The catalog refreshes daily; render again to update the numbers.

## Render it

Needs Node 22.18 or later, ffmpeg with libx264, and Playwright with Chromium (the scripts use
`require("playwright")`, or `$PLAYWRIGHT_MODULE`; Chromium runs WebGL in software, SwiftShader, so no
GPU is needed). Behind a TLS-inspecting proxy, Google Fonts are fetched through Node, which trusts
`NODE_EXTRA_CA_CERTS`; the capture stops if the brand fonts do not load.

```bash
node promo/capture.mjs            # the frames: promo/build/frames.mkv (lossless RGB, about 20 minutes)
node promo/score.mjs              # the soundtrack: promo/build/score.wav (a few seconds)
node promo/assemble.mjs           # the MP4, poster and contact sheet in promo/out/, checked
node promo/capture.mjs --stills   # one PNG a second in promo/build/stills/ (a quick look; or --stills=12.2,17.7)
node promo/storyboard.mjs         # the timing table
npx tsc -p promo                  # type-checks the stage
```

## How it is made

- **`stage.html` / `stage.ts`**: the stage. It runs the app's `UniverseEngine` with its loop off and
  reduced motion on, and `render(t)` draws the frame at `t` seconds: the camera on a monotone cubic
  spline through keyframes (it never overshoots, so it holds still on a system while it turns), the
  orbits' clock (three times the site's speed), the selection and the family and arm highlights.
  The captions and cards are HTML in the design system's tokens and fonts over the canvas, drawn
  from `t` too, so a frame depends on `t` alone and capture speed never shows. Framing comes from
  the engine's own `systemFraming()` and `viewDistance()`. The camera leaves a system by backing
  away while still facing it, and faces the next one from afar before pushing in, so it never
  whips around close to a star.
- **Motion blur**: on the fast moves a frame is drawn several times across half a frame's time (a
  180° shutter, one drawing per 2.5 pixels the fast-moving points travel, up to 24) and averaged, so
  stars streak instead of strobing. The drawings are the canvas as the app draws it, so a blurred
  frame keeps the look of a still one.
- **The engine is not changed.** The stage reaches into its private camera, clock, materials and
  `draw()`, and turns three shader constants into uniforms so a selection fades instead of switching
  at once (other systems' orbits dim, the selected star's halo grows, its named members appear). If
  the engine's shaders change, `patch()` throws instead of rendering something different.
- **`capture.mjs`**: serves the repository with Vite (no file watching, no hot reload), opens the
  stage in Chromium at 1280 × 720 CSS pixels and 1.5×, and pipes one PNG per frame into a lossless
  clip. Every frame is checked for its size and the page's pixel ratio.
- **`score.mjs`**: an original soundtrack, synthesized from code (no samples, no licensed music): D
  major at 120 BPM, one chord per shot, pads, a bass, an arpeggio with a ping-pong delay, a soft
  kick, risers into each shot change, low impacts, FM bells on the cards and a mallet note on each
  family and arm beat, through one reverb. It is measured as BS.1770 loudness, brought to −14 LUFS
  and limited under −1 dBTP; each stem's level is printed.
- **`assemble.mjs`**: encodes the MP4 and checks it: size, frame count, duration, color tags, the
  soundtrack's loudness and true peak after AAC encoding, and no frame that flashes (jumps away
  from its neighbors and straight back).

Nothing here is part of the app: `promo/` is outside `src/`, the app's `tsconfig.json` and the
Vitest includes, and `npm run build` is unchanged. `promo/build/` and `promo/out/` are not committed.
