/* Captures the promo's frames. Vite serves promo/stage.html; Chromium (SwiftShader, software WebGL)
   draws it at 1280 x 720 CSS pixels and 1.5x, and every 1/30 s of the cut becomes one PNG piped
   into a lossless clip (promo/build/frames.mkv, RGB). The stage draws a frame from its time alone,
   so how long a frame takes to render never shows.

     node promo/capture.mjs                 the whole cut (900 frames, about 8 minutes)
     node promo/capture.mjs --stills        one PNG a second into promo/build/stills/ (a quick look)
     node promo/capture.mjs --stills=12.2,17.7
*/
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { FPS, SECONDS, VIEWPORT } from "./storyboard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..");
export const BUILD = path.join(HERE, "build");
export const FFMPEG = process.env.FFMPEG || "ffmpeg";
const SIZE = [VIEWPORT.width * VIEWPORT.scale, VIEWPORT.height * VIEWPORT.scale];

/** Playwright: $PLAYWRIGHT_MODULE, or whichever install `require` finds (a project or global one). */
function playwright() {
  const require = createRequire(import.meta.url);
  try {
    return require(process.env.PLAYWRIGHT_MODULE || "playwright");
  } catch {
    throw new Error("Playwright not found: set PLAYWRIGHT_MODULE, or `npm install --no-save playwright`.");
  }
}

/**
 * Serves the repository with its own Vite config (React for the components the stage draws), with
 * no file watching and no hot reload: an edit during a capture must not reload the stage.
 */
async function serve() {
  const server = await createServer({ root: REPO, configFile: path.join(REPO, "vite.config.ts"), logLevel: "warn", server: { port: 5199, strictPort: false, hmr: false, watch: null } });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error("vite did not report a URL");
  return { server, url: new URL("promo/stage.html", url).href };
}

/**
 * Opens the stage and waits until it is ready: fonts loaded, the first frame drawn. Google Fonts are
 * fetched through Node (which trusts NODE_EXTRA_CA_CERTS behind a TLS-inspecting proxy; certificate
 * checks stay on), and the run stops if the brand fonts did not arrive.
 */
async function openStage(url) {
  const { chromium } = playwright();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-compositing", "--hide-scrollbars", "--mute-audio", "--font-render-hinting=none"],
  });
  const ctx = await browser.newContext({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.scale, colorScheme: "dark", reducedMotion: "no-preference", locale: "en-US" });
  const cache = new Map();
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const u = route.request().url();
    try {
      let hit = cache.get(u);
      if (!hit) {
        const res = await route.fetch();
        hit = { status: res.status(), headers: res.headers(), body: await res.body() };
        if (hit.status === 200) cache.set(u, hit);
      }
      await route.fulfill(hit);
    } catch (err) {
      console.warn(`fonts: ${u} failed (${err.message})`);
      await route.abort();
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Vite may optimize a dependency on the first visit and reload the page once: wait it out.
  for (let attempt = 0; ; attempt++) {
    await page.goto(url, { waitUntil: "load" });
    try {
      await page.waitForFunction(() => window.stage, null, { timeout: 60000 });
      const fonts = await page.evaluate(() => window.stage.ready);
      if (!fonts) throw new Error("the brand fonts did not load (Bricolage Grotesque, Source Sans 3, IBM Plex Mono)");
      break;
    } catch (err) {
      if (attempt >= 1 || !/context was destroyed|navigation/i.test(err.message)) throw new Error(`${err.message}${errors.length ? `\n${errors.join("\n")}` : ""}`);
    }
  }
  // Screenshots go through this CDP session, which needs the context's device metrics of its own,
  // or the page drops to a device pixel ratio of 1 after the first shot.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { mobile: false, width: VIEWPORT.width, height: VIEWPORT.height, screenWidth: VIEWPORT.width, screenHeight: VIEWPORT.height, deviceScaleFactor: VIEWPORT.scale, screenOrientation: { angle: 0, type: "landscapePrimary" } });
  return { browser, page, cdp, errors };
}

/** Draws the frame at `t` seconds and returns it as a PNG of the video's size. */
async function shoot(stage, t) {
  const [dpr, samples] = await stage.page.evaluate((t) => {
    window.stage.render(t);
    return [window.devicePixelRatio, window.stage.samples()];
  }, t);
  stage.drawings = (stage.drawings ?? 0) + samples;
  if (samples > 1) stage.blurred = (stage.blurred ?? 0) + 1;
  if (dpr !== VIEWPORT.scale) throw new Error(`the page's devicePixelRatio is ${dpr} at ${t.toFixed(2)} s, expected ${VIEWPORT.scale}`);
  const { data } = await stage.cdp.send("Page.captureScreenshot", { format: "png" });
  const png = Buffer.from(data, "base64");
  // PNG header: width and height at bytes 16 and 20.
  if (png.readUInt32BE(16) !== SIZE[0] || png.readUInt32BE(20) !== SIZE[1]) throw new Error(`a frame came out ${png.readUInt32BE(16)} x ${png.readUInt32BE(20)}, expected ${SIZE[0]} x ${SIZE[1]}`);
  if (stage.errors.length) throw new Error(`the stage reported errors:\n${stage.errors.join("\n")}`);
  return png;
}

export async function capture({ stills = null } = {}) {
  const { server, url } = await serve();
  let stage;
  try {
    stage = await openStage(url);
    fs.mkdirSync(BUILD, { recursive: true });
    if (stills) {
      if (process.env.PROMO_KEYS) console.table(await stage.page.evaluate(() => window.stage.keys));
      const dir = path.join(BUILD, "stills");
      fs.mkdirSync(dir, { recursive: true });
      for (const t of stills) {
        const file = path.join(dir, `t${t.toFixed(2).padStart(5, "0")}.png`);
        const before = stage.drawings ?? 0;
        fs.writeFileSync(file, await shoot(stage, t));
        console.log(`${path.relative(process.cwd(), file)}  (${stage.drawings - before} drawing${stage.drawings - before > 1 ? "s" : ""})`);
      }
      return;
    }
    const file = path.join(BUILD, "frames.mkv");
    // Lossless RGB: the assembly makes the one lossy encode.
    const ff = spawn(FFMPEG, ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-c:v", "libx264rgb", "-preset", "ultrafast", "-qp", "0", "-r", String(FPS), file], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
    const total = Math.round(FPS * SECONDS);
    const t0 = Date.now();
    for (let f = 0; f < total; f++) {
      const png = await shoot(stage, f / FPS);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if ((f + 1) % FPS === 0) {
        const left = ((Date.now() - t0) / (f + 1)) * (total - f - 1);
        console.log(`  ${((f + 1) / FPS).toFixed(0).padStart(2)} s of ${SECONDS}  (about ${Math.ceil(left / 60000)} min left)`);
      }
    }
    ff.stdin.end();
    await done;
    console.log(`${path.relative(process.cwd(), file)}: ${total} frames, ${SIZE[0]} x ${SIZE[1]}, ${FPS} fps (${stage.blurred ?? 0} motion-blurred, ${stage.drawings} drawings)`);
  } finally {
    await stage?.browser.close();
    await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.find((a) => a.startsWith("--stills"));
  const stills = !arg ? null : arg.includes("=") ? arg.split("=")[1].split(",").map(Number) : Array.from({ length: SECONDS }, (_, i) => i + 0.5);
  await capture({ stills });
}
