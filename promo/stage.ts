/* The promo stage: the real universe engine, driven frame by frame for capture (promo/capture.mjs).
   Not part of the app: Vite serves it in development only (promo/stage.html), and nothing in src/
   imports it.

   The engine runs with its loop off and reduced motion on (no flights, no drift): every frame,
   render(t) sets the camera from the storyboard's keyframes, the orbits' clock, the selection and
   the highlights, and draws once. The captions and cards are HTML over the canvas, drawn from t as
   well, so a frame depends on t alone. Promo-only code reaches into the engine's private camera,
   clock, materials and draw() (TypeScript's `private` is not enforced at run time), and patches
   three shader constants into uniforms so a selection can fade instead of switching at once. */
import "../src/styles/tokens.css";
import "../src/styles/base.css";
import "./stage.css";
import * as THREE from "three";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOG, derivatives } from "../src/data/catalog.ts";
import { RELATIONS, type Modality, type Relation } from "../src/data/types.ts";
import { ARM_ORDER } from "../src/lib/galaxy.ts";
import { FAMILY, MODALITY } from "../src/lib/modality.ts";
import { exact, splitId } from "../src/lib/format.ts";
import { starHex } from "../src/lib/blackbody.ts";
import { RANGE, temperature } from "../src/lib/scales.ts";
import { Mark } from "../src/components/Mark.tsx";
import { ArmIcon, FamilyGlyph } from "../src/components/Icons.tsx";
import { UniverseEngine } from "../src/three/engine.ts";
import { ARM_BEATS, CAPTIONS, CARDS, ENCODINGS, FADES, FAMILY_BEATS, FEATURED, FPS, LABELS, ORBIT_SPEED, SECONDS, SITE } from "./storyboard.mjs";

/* ---------- The engine ---------- */

const host = document.getElementById("scene")!;
const engine = new UniverseEngine(CATALOG, { onSelect() {}, onGiveUp() {} }, true);
engine.setActive(false);
engine.attach(host);
engine.setMode("hero");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const e = engine as any;

/** Turns a constant in one of the engine's shaders into a uniform; fails loudly if the shader changed. */
function patch(material: THREE.ShaderMaterial, find: string, replace: string, uniform: string, value: number): void {
  if (!material.vertexShader.includes(find)) throw new Error(`promo/stage.ts: the engine's shader no longer has "${find}"`);
  material.vertexShader = material.vertexShader.replace(find, replace).replace("void main() {", `uniform float ${uniform};\nvoid main() {`);
  material.uniforms[uniform] = { value };
  material.needsUpdate = true;
}
// Other systems' orbits dim while one is selected; the selected star's halo grows; its named members show.
patch(e.orbitMaterial, "(mine ? 1.0 : 0.3)", "(mine ? 1.0 : uOthers)", "uOthers", 0.3);
patch(e.starMaterial, "halo *= 1.0 + 0.25 * picked;", "halo *= 1.0 + uPick * picked;", "uPick", 0.25);
patch(e.planetMaterial, "vAlpha = mine ? focus : 0.0;", "vAlpha = mine ? focus * uReveal : 0.0;", "uReveal", 1);

const indexOf = (id: string) => {
  const i = CATALOG.systems.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`${id} is not in the catalog`);
  return i;
};
const RING = indexOf(FEATURED.ring);
const TREE = indexOf(FEATURED.tree);
const ringSystem = CATALOG.systems[RING];
const treeSystem = CATALOG.systems[TREE];

const smooth = (a: number, b: number, t: number) => {
  const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

/* ---------- Where the free area is (the view's center shifts away from the captions) ---------- */

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The title sits above the galaxy; the systems sit right of the lower-left captions. */
function insetsAt(t: number): Insets {
  const top = 230 * (1 - smooth(3.9, 5.4, t));
  const systems = 300 * smooth(10.2, 12.0, t) * (1 - smooth(20.4, 22.6, t));
  const overview = 150 * smooth(21.0, 22.8, t) * (1 - smooth(24.9, 26.3, t));
  return { top, right: 0, bottom: 0, left: systems + overview };
}

function applyInsets(i: Insets): void {
  e.insets = { ...i };
  e.shown = { ...i };
  e.applyViewOffset();
}

/* ---------- The camera: one spline through keyframes ---------- */

interface Key {
  t: number;
  target: THREE.Vector3;
  /** log of the distance from the target */
  logR: number;
  /** polar angle from +y */
  phi: number;
  /** azimuth around y */
  theta: number;
}

const ORIGIN = new THREE.Vector3();
const elev = (a: number) => Math.PI / 2 - a;
const key = (t: number, target: THREE.Vector3, r: number, phi: number, theta: number): Key => ({ t, target: target.clone(), logR: Math.log(r), phi, theta });

/** The distance at which the engine frames the whole galaxy from this angle, with the insets at time t. */
function galaxyDistance(t: number, phi: number, theta: number): number {
  applyInsets(insetsAt(t));
  return e.viewDistance(ORIGIN, phi, theta) as number;
}

/** The engine's own framing of a system, as seen from `from` (a camera position), with the insets at time t. */
function systemView(index: number, from: THREE.Vector3, t: number): { r: number; phi: number; theta: number } {
  e.camera.position.copy(from);
  applyInsets(insetsAt(t));
  const view = e.view;
  e.view = { kind: "system", index };
  const f = e.systemFraming(index) as { sph: THREE.Spherical };
  e.view = view;
  return { r: f.sph.radius, phi: f.sph.phi, theta: f.sph.theta };
}

/** Where a key puts the camera. */
const cameraAt = (k: Key) => new THREE.Vector3().setFromSpherical(new THREE.Spherical(Math.exp(k.logR), k.phi, k.theta)).add(k.target);

/** The azimuth (three.js's theta) that looks at `p` from outside the galaxy, toward the core. */
const outside = (p: THREE.Vector3) => Math.atan2(p.x, p.z);

/** A key that looks at `target` from `from`, `share` of the way there. */
function toward(t: number, target: THREE.Vector3, from: THREE.Vector3, share: number): Key {
  const s = new THREE.Spherical().setFromVector3(from.clone().sub(target));
  return key(t, target, s.radius * share, s.phi, s.theta);
}

const keys: Key[] = [];
{
  const ringCenter: THREE.Vector3 = e.centers[RING];
  const treeCenter: THREE.Vector3 = e.centers[TREE];
  // The galaxy turns until the camera stands outside the ring system, then dives to it, the core behind it.
  const t2 = outside(ringCenter) - 0.25;
  const p1 = elev(0.36);
  const p2 = elev(0.62);
  keys.push(key(0, ORIGIN, 640, elev(0.06), t2 - 1.27));
  keys.push(key(4.6, ORIGIN, galaxyDistance(4.6, p1, t2 - 0.84) * 1.04, p1, t2 - 0.84));
  keys.push(key(9.4, ORIGIN, galaxyDistance(9.4, p2, t2) * 0.74, p2, t2));
  // Turn to the system first, then push in (the azimuth keeps turning the same way).
  const turn = toward(10.7, ringCenter, cameraAt(keys[2]), 0.42);
  turn.theta = Math.max(turn.theta, t2 + 0.08);
  keys.push(turn);
  const rv = systemView(RING, cameraAt(keys[3]), 12.2);
  keys.push(key(12.2, ringCenter, rv.r, rv.phi, rv.theta));
  keys.push(key(14.6, ringCenter, rv.r * 0.92, rv.phi - 0.05, rv.theta + 0.45));
  // Back out of the ring system while still facing it, then across to the tree system from outside
  // the galaxy (the systems between them pass by with the core behind), facing the tree system from
  // afar before pushing in. Turning only once the camera is far keeps the move from whipping.
  keys.push(key(15.5, ringCenter, rv.r * 2.6, rv.phi - 0.12, rv.theta + 0.62));
  const mid = ringCenter.clone().add(treeCenter).multiplyScalar(0.5);
  const across = ringCenter.distanceTo(treeCenter);
  keys.push(key(16.35, mid, across * 0.72, elev(0.42), outside(mid)));
  // The tree system framed as seen from outside it, a little above the disc.
  const beyond = new THREE.Vector3().setFromSpherical(new THREE.Spherical(30, elev(0.6), outside(treeCenter))).add(treeCenter);
  const tv = systemView(TREE, beyond, 17.8);
  keys.push(key(17.05, treeCenter, tv.r * 2.6, tv.phi + 0.1, tv.theta - 0.25));
  keys.push(key(17.8, treeCenter, tv.r, tv.phi, tv.theta));
  keys.push(key(20.25, treeCenter, tv.r * 0.9, tv.phi - 0.05, tv.theta + 0.5));
  // Out over the galaxy: back from the tree system while facing it, then the core takes the center.
  keys.push(key(21.1, treeCenter, tv.r * 2.6, elev(0.75), tv.theta + 0.65));
  keys.push(key(22.1, treeCenter.clone().multiplyScalar(0.5), 60, elev(0.92), tv.theta + 0.9));
  const p8 = elev(1.0);
  const p9 = elev(1.12);
  keys.push(key(23.4, ORIGIN, galaxyDistance(23.4, p8, tv.theta + 1.15) * 1.0, p8, tv.theta + 1.15));
  keys.push(key(SECONDS, ORIGIN, galaxyDistance(SECONDS, p9, tv.theta + 1.95) * 1.14, p9, tv.theta + 1.95));
}
// Turn each azimuth the short way from the one before.
for (let i = 1; i < keys.length; i++) {
  while (keys[i].theta - keys[i - 1].theta > Math.PI) keys[i].theta -= Math.PI * 2;
  while (keys[i].theta - keys[i - 1].theta < -Math.PI) keys[i].theta += Math.PI * 2;
}

/**
 * A monotone cubic through the keyframes (Fritsch-Carlson, as PCHIP): smooth, and it never
 * overshoots a key, so the camera holds still on a system while only its azimuth turns.
 */
function channel(get: (k: Key) => number): (t: number) => number {
  const n = keys.length;
  const x = keys.map((k) => k.t);
  const y = keys.map(get);
  const h = x.slice(1).map((v, i) => v - x[i]);
  const d = h.map((hi, i) => (y[i + 1] - y[i]) / hi);
  const m = new Array<number>(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return (t: number) => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0;
    while (i < n - 2 && t > x[i + 1]) i++;
    const s = (t - x[i]) / h[i];
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h[i] * m[i + 1];
  };
}

const tx = channel((k) => k.target.x);
const ty = channel((k) => k.target.y);
const tz = channel((k) => k.target.z);
const logR = channel((k) => k.logR);
const phi = channel((k) => k.phi);
const theta = channel((k) => k.theta);

function placeCamera(t: number): void {
  const target = new THREE.Vector3(tx(t), ty(t), tz(t));
  const sph = new THREE.Spherical(Math.exp(logR(t)), THREE.MathUtils.clamp(phi(t), 0.05, Math.PI - 0.05), theta(t));
  e.controls.target.copy(target);
  e.camera.position.setFromSpherical(sph).add(target);
  e.camera.lookAt(target);
  e.camera.updateMatrixWorld();
}

/* ---------- What the universe shows ---------- */

type Phase = "galaxy" | "ring" | "tree" | "over";
let phase: Phase | null = null;

function phaseAt(t: number): Phase {
  if (t < 10.0) return "galaxy";
  if (t < 16.0) return "ring";
  if (t < 21.0) return "tree";
  return "over";
}

function beat<T extends { from: number; to: number }>(list: readonly T[], t: number): T | null {
  return list.find((b) => t >= b.from && t < b.to) ?? null;
}

/** How far a selection has faded in: 0 when the switch happens (and invisible), 1 once settled. */
function selectionAt(t: number): number {
  if (t < 10.0) return 0;
  if (t < 16.0) return smooth(10.0, 11.6, t) * (1 - smooth(15.1, 15.95, t));
  if (t < 21.0) return smooth(16.0, 17.3, t) * (1 - smooth(20.2, 20.95, t));
  return 0;
}

function setScene(t: number): void {
  const p = phaseAt(t);
  if (p !== phase) {
    phase = p;
    if (p === "galaxy") {
      engine.setMode("hero");
      engine.showGalaxy();
    } else if (p === "ring") engine.showSystem(FEATURED.ring);
    else if (p === "tree") engine.showSystem(FEATURED.tree);
    else {
      engine.setMode("explore");
      engine.showGalaxy();
    }
  }
  engine.setFamily(p === "tree" ? ((beat(FAMILY_BEATS, t)?.relation as Relation | undefined) ?? null) : null);
  engine.setArm(p === "over" ? ((beat(ARM_BEATS, t)?.arm as Modality | undefined) ?? null) : null);
  const s = selectionAt(t);
  e.orbitMaterial.uniforms.uOthers.value = THREE.MathUtils.lerp(1, 0.3, s);
  e.starMaterial.uniforms.uPick.value = 0.25 * s;
  e.planetMaterial.uniforms.uReveal.value = s;
  e.selectRing.material.opacity = 0.9 * s;
  // Up close, the halos tighten and the dust dims, eased instead of at the switch.
  const close = smooth(10.3, 12.0, t) * (1 - smooth(20.5, 22.6, t));
  e.starMaterial.uniforms.uHaloScale.value = THREE.MathUtils.lerp(1, 0.22, close);
  e.dustMaterial.uniforms.uDim.value = THREE.MathUtils.lerp(1, 0.55, close);
  e.time = t * ORBIT_SPEED;
}

function labelOpacity(t: number): number {
  let o = 0;
  for (const [a, b] of LABELS.spans) o = Math.max(o, smooth(a, a + LABELS.fade, t) * (1 - smooth(b - LABELS.fade, b, t)));
  return o;
}

/* ---------- The overlay: cards and captions ---------- */

const overlay = document.getElementById("overlay")!;
const svg = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const MARK = svg(createElement(Mark, { size: 76 }));

/** The encodings' small pictures: three sizes, a glow, the color scale's spectrum. */
function encodingGlyph(k: string): string {
  if (k === "size")
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="var(--color-ink-secondary)"><circle cx="4" cy="15" r="2"/><circle cx="10.5" cy="13.5" r="3.5"/><circle cx="18.5" cy="12" r="5"/></g></svg>`;
  if (k === "glow")
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="enc-glow"><stop offset="0" stop-color="var(--color-core-white)" stop-opacity="1"/><stop offset="0.35" stop-color="var(--color-core-gold)" stop-opacity="0.45"/><stop offset="1" stop-color="var(--color-core-gold)" stop-opacity="0"/></radialGradient></defs><circle cx="12" cy="12" r="11" fill="url(#enc-glow)"/><circle cx="12" cy="12" r="2.4" fill="var(--color-core-white)"/></svg>`;
  const stops = Array.from({ length: 6 }, (_, i) => {
    const s = 10 ** ((i / 5) * Math.log10(1 + RANGE.trending[1])) - 1;
    return `<stop offset="${i / 5}" stop-color="${starHex(temperature(s))}"/>`;
  }).join("");
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="enc-heat">${stops}</linearGradient></defs><rect x="1" y="8.5" width="22" height="7" rx="3.5" fill="url(#enc-heat)"/></svg>`;
}

const number = (n: number) => `<b>${exact(n)}</b>`;
const values: Record<string, string> = {
  stars: number(CATALOG.systems.length),
  orbiting: number(CATALOG.systems.reduce((a, s) => a + derivatives(s), 0)),
  ringName: splitId(ringSystem.id)[1],
  ringCount: number(ringSystem.tree.adapter.count),
  treeName: splitId(treeSystem.id)[1],
  treeCount: number(derivatives(treeSystem)),
};
const fill = (s: string) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in values)) throw new Error(`promo/stage.ts: no value for {${k}}`);
    return values[k];
  });

function el(tag: string, cls: string, html = ""): HTMLElement {
  const n = document.createElement(tag);
  n.className = cls;
  n.innerHTML = html;
  return n;
}

const warm = (s: string) => s.replace(/(\S+)$/, '<span class="warm">$1</span>');

// Title card.
const title = el("div", "card card-title");
const titleMark = el("div", "card-mark", MARK);
const titleName = el("h1", "card-name", CARDS.title.name);
const titleTag = el("p", "card-tagline", warm(CARDS.title.tagline));
title.append(titleMark, titleName, titleTag);

// Captions.
interface Chip {
  key: string;
  node: HTMLElement;
}
const captions = CAPTIONS.map((c) => {
  const box = el("div", "caption");
  box.append(el("h2", "caption-title", fill(c.title)));
  if (c.sub) box.append(el("p", "caption-sub", fill(c.sub)));
  const row = el("div", "chips");
  let chips: Chip[] = [];
  if (c.chips === "encodings")
    chips = ENCODINGS.map((x) => ({ key: x.key, node: el("span", "chip-promo", `${encodingGlyph(x.key)}<span class="chip-name">${x.name}</span><span class="chip-value">${x.value}</span>`) }));
  else if (c.chips === "families")
    chips = RELATIONS.map((r) => ({
      key: r,
      node: el("span", "chip-promo", `${svg(createElement(FamilyGlyph, { relation: r, size: 24 }))}<span class="chip-name">${FAMILY[r].many}</span><span class="chip-count">${exact(treeSystem.tree[r].count)}</span>`),
    }));
  else if (c.chips === "arms")
    chips = ARM_ORDER.map((m) => ({
      key: m,
      node: el("span", "chip-promo", `<span class="swatch" style="background: var(--color-arm-${m})"></span>${svg(createElement(ArmIcon, { arm: m, size: 18 }))}<span class="chip-name">${MODALITY[m].label}</span>`),
    }));
  if (chips.length) {
    for (const ch of chips) row.append(ch.node);
    box.append(row);
  }
  overlay.append(box);
  return { c, box, chips };
});

// End card.
const scrim = el("div", "end-scrim");
const end = el("div", "card card-end");
const endMark = el("div", "card-mark", MARK);
const endName = el("h1", "card-name", CARDS.end.name);
const endTag = el("p", "card-tagline", warm(CARDS.end.tagline));
const endCta = el("p", "card-cta", SITE);
const endNote = el("p", "card-note", CARDS.end.note);
const endFine = el("p", "card-fine", CARDS.end.fine);
end.append(endMark, endName, endTag, endCta, endNote, endFine);

const vignette = el("div", "vignette");
const black = el("div", "black");
overlay.append(title, scrim, end, vignette, black);

/** Opacity and entrance of an element appearing at `a` and leaving at `b` (blurred and lower while it arrives). */
function show(node: HTMLElement, t: number, a: number, b: number, opts: { rise?: number; blur?: number; fadeIn?: number; fadeOut?: number; scaleOut?: number; dim?: number } = {}): void {
  const fi = opts.fadeIn ?? 0.45;
  const fo = opts.fadeOut ?? 0.35;
  const i = smooth(a, a + fi, t);
  const o = 1 - smooth(b - fo, b, t);
  const v = Math.min(i, o) * (opts.dim ?? 1);
  const rise = (1 - i) * (opts.rise ?? 14);
  const blur = (1 - i) * (opts.blur ?? 6) + (1 - o) * (opts.blur ?? 6) * 0.5;
  const scale = 1 + (1 - o) * (opts.scaleOut ?? 0);
  node.style.opacity = v.toFixed(4);
  node.style.transform = `translateY(${rise.toFixed(2)}px) scale(${scale.toFixed(4)})`;
  node.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
  node.style.visibility = v > 0.001 ? "visible" : "hidden";
}

/** A name that arrives in wide tracking and settles tight. */
function track(node: HTMLElement, t: number, a: number, from: number): void {
  node.style.letterSpacing = `${(from * (1 - smooth(a, a + 1.4, t)) - 0.035).toFixed(4)}em`;
}

/** The mark turns slowly, as a galaxy would (its arms trail: counterclockwise). */
function turn(mark: HTMLElement, t: number, a: number): void {
  (mark.firstElementChild as SVGElement).style.transform = `rotate(${(14 - 7 * (t - a)).toFixed(3)}deg)`;
}

function drawOverlay(t: number): void {
  const tc = CARDS.title;
  show(title, t, tc.from, tc.to, { rise: 0, blur: 0, fadeIn: 0.01, fadeOut: 0.55, scaleOut: 0.04 });
  show(titleMark, t, tc.from, tc.to + 1, { rise: 10, blur: 10, fadeIn: 0.8 });
  show(titleName, t, tc.from + 0.2, tc.to + 1, { rise: 16, blur: 12, fadeIn: 1.0 });
  track(titleName, t, tc.from + 0.2, 0.16);
  turn(titleMark, t, tc.from);
  show(titleTag, t, tc.from + 0.9, tc.to + 1, { rise: 12, blur: 8, fadeIn: 0.7 });

  for (const { c, box, chips } of captions) {
    show(box, t, c.from, c.to, { rise: 16, blur: 8 });
    if (!chips.length) continue;
    const on = c.chips === "families" ? beat(FAMILY_BEATS, t)?.relation : c.chips === "arms" ? beat(ARM_BEATS, t)?.arm : undefined;
    chips.forEach(({ key, node }, k) => {
      node.classList.toggle("is-on", key === on);
      const enter = c.chips === "encodings" ? c.from + 1.3 + k * 0.35 : c.from + 0.3 + k * 0.12;
      show(node, t, enter, c.to + 1, { rise: 10, blur: 4, fadeIn: 0.4, dim: on && key !== on ? 0.55 : 1 });
    });
  }

  const ec = CARDS.end;
  const after = SECONDS + 1;
  show(scrim, t, ec.from - 0.3, after, { rise: 0, blur: 0, fadeIn: 1.0 });
  show(end, t, ec.from, after, { rise: 0, blur: 0, fadeIn: 0.01 });
  show(endMark, t, ec.from, after, { rise: 10, blur: 10, fadeIn: 0.7 });
  show(endName, t, ec.from + 0.2, after, { rise: 16, blur: 12, fadeIn: 0.8 });
  track(endName, t, ec.from + 0.2, 0.12);
  turn(endMark, t, ec.from);
  show(endTag, t, ec.from + 0.55, after, { rise: 12, blur: 8, fadeIn: 0.6 });
  show(endCta, t, ec.from + 0.95, after, { rise: 12, blur: 6, fadeIn: 0.6 });
  show(endNote, t, ec.from + 1.35, after, { rise: 8, blur: 4, fadeIn: 0.6 });
  show(endFine, t, ec.from + 1.6, after, { rise: 6, blur: 3, fadeIn: 0.6 });

  const fade = Math.max(1 - smooth(0, FADES.in, t), smooth(SECONDS - FADES.out, SECONDS, t));
  black.style.opacity = fade.toFixed(4);
}

/** Labels keep clear of the captions on screen. */
function blockedAt(): { l: number; t: number; r: number; b: number }[] {
  const out = [];
  for (const { box } of captions) {
    if (box.style.visibility !== "visible") continue;
    const r = box.getBoundingClientRect();
    out.push({ l: r.left - 16, t: r.top - 16, r: r.right + 16, b: r.bottom + 16 });
  }
  return out;
}

/* ---------- Motion blur ---------- */

// On the fast moves a frame is drawn several times across half a frame's time (a 180° shutter) and
// the drawings are averaged, so stars streak instead of strobing. Each drawing is the canvas as the
// app draws it (sRGB, blended there), so a blurred frame keeps the look of a still one.
const SHUTTER = 0.5 / FPS;
const MAX_SAMPLES = 24;
const renderer: THREE.WebGLRenderer = e.renderer;
const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
const grab = new THREE.FramebufferTexture(buffer.x, buffer.y);
const accum = new THREE.WebGLRenderTarget(buffer.x, buffer.y, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
grab.minFilter = grab.magFilter = THREE.NearestFilter;
const quadCamera = new THREE.Camera();
const QUAD_VERT = "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}";
function quad(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending): { scene: THREE.Scene; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader, blending, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, material };
}
// Adds one drawing, weighted, to the average; then puts the average on the canvas as it is.
const addPass = quad("uniform sampler2D uMap;\nuniform float uWeight;\nvarying vec2 vUv;\nvoid main() {\n  gl_FragColor = vec4(texture2D(uMap, vUv).rgb * uWeight, 1.0);\n}", { uMap: { value: grab }, uWeight: { value: 1 } }, THREE.AdditiveBlending);
const showPass = quad("uniform sampler2D uMap;\nvarying vec2 vUv;\nvoid main() {\n  gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0);\n}", { uMap: { value: accum.texture } }, THREE.NoBlending);

/** Fixed points to measure the camera's motion by: the stars and a scatter over the disc. */
const PROBES = (() => {
  const points = e.centers.slice(0, CATALOG.systems.length).map((c: THREE.Vector3) => c.clone()) as THREE.Vector3[];
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400; i++) {
    const r = 60 * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    points.push(new THREE.Vector3(r * Math.cos(a), (rnd() - 0.5) * 2, r * Math.sin(a)));
  }
  return points;
})();

/** The probes on screen at time t, in device pixels (null when behind the camera, too near or off screen). */
function onScreen(t: number): (THREE.Vector2 | null)[] {
  applyInsets(insetsAt(t));
  placeCamera(t);
  const v = new THREE.Vector3();
  return PROBES.map((p) => {
    if (-v.copy(p).applyMatrix4(e.camera.matrixWorldInverse).z < 6) return null;
    v.copy(p).project(e.camera);
    if (Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    return new THREE.Vector2(((v.x + 1) / 2) * buffer.x, ((1 - v.y) / 2) * buffer.y);
  });
}

/** How far the fast-moving points (the 90th percentile) travel on screen while the shutter is open, in device pixels. */
function blurAt(t: number): number {
  const a = onScreen(t - SHUTTER / 2);
  const b = onScreen(t + SHUTTER / 2);
  const moved: number[] = [];
  a.forEach((p, i) => {
    const q = b[i];
    if (p && q) moved.push(p.distanceTo(q));
  });
  if (!moved.length) return 0;
  moved.sort((x, y) => x - y);
  return moved[Math.floor(moved.length * 0.9)];
}

/** How far the stars themselves move on screen in one frame (the median), in device pixels. */
function starMotionAt(t: number): number {
  const a = onScreen(t - 0.5 / FPS);
  const b = onScreen(t + 0.5 / FPS);
  const moved: number[] = [];
  for (let i = 0; i < CATALOG.systems.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p && q) moved.push(p.distanceTo(q));
  }
  moved.sort((x, y) => x - y);
  return moved.length ? moved[moved.length >> 1] : 0;
}

/** How many drawings the frame at t needs: one per 2.5 pixels of blur. */
function samplesAt(t: number): number {
  return THREE.MathUtils.clamp(Math.ceil(blurAt(t) / 2.5), 1, MAX_SAMPLES);
}

/* ---------- One frame ---------- */

/** The universe at time t: what it shows, the free area, the camera. */
function frameAt(t: number): void {
  setScene(t);
  applyInsets(insetsAt(t));
  placeCamera(t);
}

/** Draws the scene as the engine's draw() does, without its labels. */
function drawScene(): void {
  e.orbitMaterial.uniforms.uTime.value = e.time;
  e.planetMaterial.uniforms.uTime.value = e.time;
  e.updateRings();
  renderer.setRenderTarget(null);
  renderer.render(e.scene, e.camera);
}

let lastSamples = 1;

function render(t: number): void {
  drawOverlay(t);
  e.blocked = blockedAt();
  const n = samplesAt(t);
  lastSamples = n;
  if (n > 1) {
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    addPass.material.uniforms.uWeight.value = 1 / n;
    for (let k = 0; k < n; k++) {
      frameAt(t + SHUTTER * ((k + 0.5) / n - 0.5));
      drawScene();
      renderer.copyFramebufferToTexture(grab);
      renderer.setRenderTarget(accum);
      if (k === 0) {
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.setClearColor(clear, alpha);
      }
      renderer.autoClear = false;
      renderer.render(addPass.scene, quadCamera);
      renderer.autoClear = true;
    }
    renderer.setRenderTarget(null);
    renderer.render(showPass.scene, quadCamera);
  }
  // The labels (and a still frame) at t itself.
  frameAt(t);
  if (n > 1) e.layoutLabels();
  else e.draw();
  (e.labels.root as HTMLElement).style.opacity = labelOpacity(t).toFixed(4);
}

declare global {
  interface Window {
    stage: { ready: Promise<boolean>; render(t: number): void; samples(): number; blur(t: number): number; starMotion(t: number): number; fps: number; seconds: number; values: Record<string, string>; keys: object[] };
  }
}

const FONTS = ['800 104px "Bricolage Grotesque"', '700 46px "Bricolage Grotesque"', '400 17px "Source Sans 3"', '600 14px "Source Sans 3"', '500 17px "IBM Plex Mono"'];

window.stage = {
  // Labels and cards are measured in the page's fonts; ready reports whether every one loaded.
  ready: Promise.all(FONTS.map((f) => document.fonts.load(f))).then((loaded) =>
    document.fonts.ready.then(() => {
      e.labels.measure();
      render(0);
      return loaded.every((faces) => faces.length > 0);
    }),
  ),
  render,
  samples: () => lastSamples,
  blur: (t: number) => blurAt(t),
  starMotion: (t: number) => starMotionAt(t),
  fps: FPS,
  seconds: SECONDS,
  values,
  keys: keys.map((k) => ({ t: k.t, target: k.target.toArray().map((v) => +v.toFixed(2)), r: +Math.exp(k.logR).toFixed(2), elevation: +(Math.PI / 2 - k.phi).toFixed(3), theta: +k.theta.toFixed(3) })),
};
