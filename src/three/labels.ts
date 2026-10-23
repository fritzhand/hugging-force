/* Labels over the universe: plain DOM elements the engine moves each frame (never React state),
   so they use the page's fonts and stay crisp. The engine projects each label's anchor, then
   place() keeps the highest-priority labels and hides any that would overlap one already placed,
   lie off screen or sit under a covered area (the HUD, the hero's copy). */

export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface LabelSpec {
  key: string;
  /** "star", "planet", "arm", "year", "core": the CSS class suffix. */
  kind: string;
  title: string;
  /** A second line (an owner, a family), or "". */
  sub?: string;
  /** A color for the small marker before the title (an arm's or a family's), or null. */
  swatch?: string | null;
}

interface Label {
  spec: LabelSpec;
  el: HTMLDivElement;
  w: number;
  h: number;
  shown: boolean;
  opacity: number;
}

export interface Placement {
  key: string;
  /** Anchor in CSS pixels from the host's top left. */
  x: number;
  y: number;
  /** Larger wins a contested spot. */
  priority: number;
  /** Lift the label this many pixels above its anchor (a star's glow). */
  lift: number;
  /** 0 to 1. */
  opacity: number;
}

/** True when two rectangles overlap (touching does not count). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
}

/**
 * Which candidate rectangles may show: in priority order, a rectangle shows when it is inside
 * `bounds`, clear of every `blocked` area and of every rectangle already shown.
 */
export function declutter<T extends { rect: Rect; priority: number }>(items: readonly T[], bounds: Rect, blocked: readonly Rect[]): Set<T> {
  const shown = new Set<T>();
  const placed: Rect[] = [];
  for (const it of [...items].sort((a, b) => b.priority - a.priority)) {
    const r = it.rect;
    if (r.l < bounds.l || r.t < bounds.t || r.r > bounds.r || r.b > bounds.b) continue;
    if (blocked.some((b) => overlaps(r, b))) continue;
    if (placed.some((p) => overlaps(r, p))) continue;
    placed.push(r);
    shown.add(it);
  }
  return shown;
}

export class LabelLayer {
  readonly root: HTMLDivElement;
  private labels = new Map<string, Label>();

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "hf-labels";
    this.root.setAttribute("aria-hidden", "true");
  }

  /** Replaces every label (the catalog changed). */
  set(specs: readonly LabelSpec[]): void {
    for (const l of this.labels.values()) l.el.remove();
    this.labels.clear();
    for (const spec of specs) {
      const el = document.createElement("div");
      el.className = `hf-label hf-label-${spec.kind}`;
      if (spec.swatch) {
        const dot = document.createElement("span");
        dot.className = "hf-label-swatch";
        dot.style.background = spec.swatch;
        el.appendChild(dot);
      }
      const text = document.createElement("span");
      text.className = "hf-label-text";
      const title = document.createElement("span");
      title.className = "hf-label-title";
      title.textContent = spec.title;
      text.appendChild(title);
      if (spec.sub) {
        const sub = document.createElement("span");
        sub.className = "hf-label-sub";
        sub.textContent = spec.sub;
        text.appendChild(sub);
      }
      el.appendChild(text);
      this.root.appendChild(el);
      this.labels.set(spec.key, { spec, el, w: 0, h: 0, shown: false, opacity: 0 });
    }
    this.measure();
  }

  /** Measures every label (call again once the page's fonts have loaded). */
  measure(): void {
    for (const l of this.labels.values()) {
      l.el.style.visibility = "hidden";
      l.el.style.display = "flex";
      l.w = l.el.offsetWidth;
      l.h = l.el.offsetHeight;
      l.el.style.display = l.shown ? "flex" : "none";
      l.el.style.visibility = "";
    }
  }

  /** Shows the given placements (decluttered); hides every other label. */
  place(placements: readonly Placement[], bounds: Rect, blocked: readonly Rect[]): void {
    const items = [];
    for (const p of placements) {
      const l = this.labels.get(p.key);
      if (!l || p.opacity <= 0.02) continue;
      if (!l.w) {
        l.el.style.display = "flex";
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
      const x = Math.round(p.x - l.w / 2);
      const y = Math.round(p.y - p.lift - l.h);
      items.push({ p, l, x, y, priority: p.priority, rect: { l: x - 2, t: y - 2, r: x + l.w + 2, b: y + l.h + 2 } });
    }
    const shown = declutter(items, bounds, blocked);
    const visible = new Set<Label>();
    for (const it of shown) {
      visible.add(it.l);
      it.l.shown = true;
      it.l.el.style.display = "flex";
      it.l.el.style.transform = `translate3d(${it.x}px, ${it.y}px, 0)`;
      it.l.el.style.opacity = String(it.p.opacity);
    }
    for (const l of this.labels.values()) {
      if (visible.has(l) || !l.shown) continue;
      l.shown = false;
      l.el.style.display = "none";
    }
  }

  dispose(): void {
    this.root.remove();
    this.labels.clear();
  }
}
