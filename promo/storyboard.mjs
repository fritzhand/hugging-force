/* The promo's storyboard: one 30-second 16:9 cut, a single camera move through the real universe.
   The stage (promo/stage.ts) and the soundtrack (promo/score.mjs) both read it, so the camera, the
   captions and the music meet on the same beats. Times are seconds in the cut.

   Every number in a caption is read from src/data/catalog.json when the stage renders (the counts
   below are placeholders filled by the stage), so the cut always shows the snapshot it was made from.
   `node promo/storyboard.mjs` prints the timing table. */

export const FPS = 30;
export const SECONDS = 30;
/** CSS pixels at a device pixel ratio: 1920 x 1080 frames, the desktop layout. */
export const VIEWPORT = { width: 1280, height: 720, scale: 1.5 };

export const SITE = "huggingforce.com";

/** The two systems the camera visits. */
export const FEATURED = {
  ring: "black-forest-labs/FLUX.1-dev",
  tree: "meta-llama/Llama-3.1-8B-Instruct",
};

/** Orbits turn this many times faster than the site's, so their motion reads in a few seconds. */
export const ORBIT_SPEED = 3;

/**
 * The shots, in order. The camera never cuts: each shot hands over to the next with a move.
 * `labels` fades the scene's own labels in and out (they stay hidden during the long moves).
 */
export const SHOTS = [
  { id: "arrival", from: 0, to: 5, what: "Out of deep space toward the galaxy; the title." },
  { id: "galaxy", from: 5, to: 10, what: "A sweep around the galaxy, its stars named." },
  { id: "ring", from: 10, to: 15.5, what: "Down into FLUX.1-dev's system and around its ring of adapters." },
  { id: "tree", from: 15.5, to: 20.5, what: "Across to Llama 3.1 8B Instruct; each family of its model tree lights up in turn." },
  { id: "time", from: 20.5, to: 25.5, what: "Out and over the galaxy; each arm lights up in turn, the year rings named." },
  { id: "end", from: 25.5, to: 30, what: "The end card over the turning galaxy." },
];

/** When the scene's labels show (fading over `fade` seconds at each edge). */
export const LABELS = {
  fade: 0.45,
  spans: [
    [5.3, 9.7],
    [12.3, 15.3],
    [17.4, 20.3],
    [22.3, 25.6],
  ],
};

/** Each family of the tree system lights up for a beat (and its chip with it), inside out. */
export const FAMILY_BEATS = [
  { relation: "quantized", from: 17.5, to: 18.25 },
  { relation: "adapter", from: 18.25, to: 19.0 },
  { relation: "finetune", from: 19.0, to: 19.75 },
  { relation: "merge", from: 19.75, to: 20.4 },
];

/** Each arm lights up for a beat (and its chip with it). */
export const ARM_BEATS = [
  { arm: "nlp", from: 22.4, to: 23.0 },
  { arm: "cv", from: 23.0, to: 23.6 },
  { arm: "audio", from: 23.6, to: 24.2 },
  { arm: "multimodal", from: 24.2, to: 24.8 },
];

/**
 * Captions (lower left). `{stars}`, `{orbiting}`, `{ringName}`, `{ringCount}`, `{treeName}` and
 * `{treeCount}` are filled from the catalog. `chips` shows a row of chips under the caption: the
 * star encodings, the tree's families (with their counts) or the arms.
 */
export const CAPTIONS = [
  { from: 5.5, to: 9.6, title: "Every star is a model on Hugging Face", sub: "{stars} stars · {orbiting} models in orbit", chips: "encodings" },
  { from: 12.3, to: 15.3, title: "Everything built on a model orbits it", sub: "{ringName} · {ringCount} adapters in its ring" },
  { from: 17.2, to: 20.4, title: "Quantizations, adapters, fine-tunes, merges", sub: "{treeName} · {treeCount} models, one point each", chips: "families" },
  { from: 21.4, to: 25.3, title: "Arms are modalities. Every ring is a year.", chips: "arms" },
];

/** The star encodings, as the caption's chips name them (docs/universe.md). */
export const ENCODINGS = [
  { key: "size", name: "Size", value: "parameters" },
  { key: "glow", name: "Glow", value: "downloads" },
  { key: "color", name: "Color", value: "trending" },
];

/** The title card and the end card. */
export const CARDS = {
  title: { from: 0.7, to: 4.7, name: "Hugging Force", tagline: "The open-model universe." },
  end: {
    from: 25.7,
    to: 30,
    name: "Hugging Force",
    tagline: "The open-model universe.",
    note: "Open source · Hub data refreshed daily",
    fine: "An independent project, not affiliated with Hugging Face.",
  },
};

/** The cut fades in from black and out to black. */
export const FADES = { in: 0.6, out: 0.9 };

/** Where the soundtrack lands its moments (promo/score.mjs). */
export const MUSIC = {
  /** Chords change on these beats: the cut's shots. */
  chords: [0, 5, 10, 15.5, 20.5, 25.5],
  /** A low swell lands on these. */
  impacts: [5, 25.5],
  /** A rising sweep ends on each shot change. */
  risers: [5, 10, 15.5, 20.5, 25.5],
  /** A bell rings as each card appears. */
  bells: [0.9, 25.8],
  /** A soft pluck marks each family and arm beat. */
  accents: [17.5, 18.25, 19.0, 19.75, 22.4, 23.0, 23.6, 24.2],
  /** The arpeggio runs between these times, the soft kick (every other beat) between the second pair. */
  pulse: [5, 25.5],
  kick: [10, 25.5],
  bpm: 120,
  /** Loudness of the finished soundtrack. */
  lufs: -14,
  truePeak: -1,
};

// `node promo/storyboard.mjs` prints the timing table.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("storyboard.mjs")) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${SECONDS} s at ${FPS} fps, ${VIEWPORT.width * VIEWPORT.scale} x ${VIEWPORT.height * VIEWPORT.scale}\n`);
  for (const s of SHOTS) console.log(`${pad(s.id, 8)} ${pad(`${s.from.toFixed(1)}-${s.to.toFixed(1)}`, 10)} ${s.what}`);
  console.log("");
  for (const c of CAPTIONS) console.log(`caption  ${pad(`${c.from.toFixed(1)}-${c.to.toFixed(1)}`, 10)} ${c.title}${c.sub ? ` / ${c.sub}` : ""}`);
}
