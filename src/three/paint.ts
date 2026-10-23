/* Every canvas the universe paints: the nebula sky, the Hub's glow and the selection ring.
   All are CPU-backed (cpuCanvas) and repainted after a WebGL context restore. Decoration only:
   nothing painted here carries data. */
import { COLOR } from "../design/tokens.ts";
import { seeded } from "../lib/hash.ts";

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** An equirectangular sky: deep violet night, soft nebulae in rose, violet and amber, and a faint band. */
export function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, COLOR.sky.deep);
  g.addColorStop(0.5, COLOR.sky.base);
  g.addColorStop(1, COLOR.sky.deep);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const rand = seeded(2024);
  const tints = [COLOR.nebula.violet, COLOR.nebula.rose, COLOR.nebula.violet, COLOR.nebula.amber];
  // A faint band across the sky, like the plane of a far galaxy.
  for (let i = 0; i < 46; i++) {
    const x = (i / 46) * w;
    const y = h * (0.52 + 0.06 * Math.sin((i / 46) * Math.PI * 2 + 0.7));
    blob(ctx, w, x, y, h * (0.07 + 0.05 * rand()), rgba(tints[i % tints.length], 0.05 + 0.04 * rand()));
  }
  // Nebulae, mostly away from the poles (where the texture is stretched).
  for (let i = 0; i < 18; i++) {
    const x = rand() * w;
    const y = h * (0.25 + 0.5 * rand());
    const r = h * (0.08 + 0.2 * rand());
    blob(ctx, w, x, y, r, rgba(tints[Math.floor(rand() * tints.length)], 0.06 + 0.1 * rand()));
  }
  ctx.globalCompositeOperation = "source-over";
}

/** A soft round blob, drawn twice across the seam so the sky wraps. */
function blob(ctx: CanvasRenderingContext2D, w: number, x: number, y: number, r: number, color: string): void {
  for (const dx of [-w, 0, w]) {
    const cx = x + dx;
    if (cx + r < 0 || cx - r > w) continue;
    const g = ctx.createRadialGradient(cx, y, 0, cx, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, y - r, r * 2, r * 2);
  }
}

/** The Hub's glow at the core: white heat to Hugging Face yellow and orange, fading out. */
export function paintCoreGlow(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, rgba(COLOR.core.white, 1));
  g.addColorStop(0.06, rgba(COLOR.core.white, 0.95));
  g.addColorStop(0.14, rgba(COLOR.core.gold, 0.7));
  g.addColorStop(0.32, rgba(COLOR.core.ember, 0.22));
  g.addColorStop(0.62, rgba(COLOR.core.ember, 0.05));
  g.addColorStop(1, rgba(COLOR.core.ember, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** A thin bright ring with a soft edge: the marker around the selected or hovered star. */
export function paintRing(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  ctx.strokeStyle = rgba(COLOR.hf.yellow, 0.95);
  ctx.lineWidth = size * 0.018;
  ctx.shadowColor = rgba(COLOR.hf.yellow, 0.8);
  ctx.shadowBlur = size * 0.04;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}
