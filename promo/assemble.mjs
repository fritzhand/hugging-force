/* Assembles the promo: the captured frames (promo/build/frames-<format>.mkv) and the soundtrack
   (promo/build/score.wav) become one MP4, with a poster and a contact sheet.

   H.264 High 4.1, yuv420p, BT.709, 30 fps, CRF 18, +faststart; AAC 48 kHz stereo at 192 kb/s.
   The finished file is checked: its size, frame count and duration, the soundtrack's loudness and
   true peak after encoding, and no frame that jumps away from its neighbors and straight back (a
   blank or half-drawn frame).

     node promo/assemble.mjs                  writes promo/out/hugging-force-promo-16x9.mp4 and friends
     node promo/assemble.mjs --format=9x16    the 9:16 cut
*/
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FPS, MUSIC, SECONDS, formatFrom } from "./storyboard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, "build");
export const OUT = path.join(HERE, "out");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

function run(args, { quiet = true } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, ["-y", "-hide_banner", ...(quiet ? ["-v", "error"] : []), ...args], { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}: ${args.join(" ")}`))));
  });
}

/** Integrated loudness and true peak of a file's audio, as ffmpeg's EBU R128 meter reads them. */
function loudness(file) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const summary = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(peak)) throw new Error(`could not measure the loudness of ${file}`);
  return { lufs, peak };
}

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,profile,level,width,height,pix_fmt,color_space,color_primaries,color_transfer,r_frame_rate,nb_read_frames,sample_rate,channels,bit_rate:format=duration,size", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Decodes a clip as small gray frames (192 x 108, or 108 x 192 upright), one Uint8Array each. */
function grayFrames(file, portrait) {
  return new Promise((res, rej) => {
    const [w, h] = portrait ? [108, 192] : [192, 108];
    const p = spawn(FFMPEG, ["-v", "error", "-i", file, "-vf", `scale=${w}:${h}:flags=area,format=gray`, "-f", "rawvideo", "-"], { stdio: ["ignore", "pipe", "inherit"] });
    const size = w * h;
    const frames = [];
    let buf = Buffer.alloc(0);
    p.stdout.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= size) {
        frames.push(new Uint8Array(buf.subarray(0, size)));
        buf = buf.subarray(size);
      }
    });
    p.on("close", (c) => (c === 0 ? res(frames) : rej(new Error(`ffmpeg could not decode ${file}`))));
  });
}

/**
 * Frames that jump away from their neighbors and straight back: frames i..i+k-1 (k = 1 or 2) whose
 * jump in and jump out are both above max(10 x the median jump around them, 4), while the frames on
 * either side resemble each other far more than the flash (the same test as Embarc-3d's promo).
 */
async function flashes(file, portrait) {
  const F = await grayFrames(file, portrait);
  const diff = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  };
  const d = F.map((f, i) => (i ? diff(F[i - 1], f) : 0));
  const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0;
  const found = [];
  for (let i = 1; i < F.length; i++) {
    for (const k of [1, 2]) {
      if (i + k >= F.length) continue;
      const limit = Math.max(4, 10 * median(d.slice(Math.max(1, i - 15), Math.min(F.length, i + 16))));
      if (d[i] <= limit || d[i + k] <= limit) continue;
      if (diff(F[i - 1], F[i + k]) < 0.5 * Math.min(d[i], d[i + k])) {
        found.push({ frame: i, t: +(i / FPS).toFixed(2), length: k });
        break;
      }
    }
  }
  return { frames: F.length, found, largest: +Math.max(...d).toFixed(2) };
}

export async function assemble(format) {
  const W = format.width * format.scale;
  const H = format.height * format.scale;
  const portrait = H > W;
  const frames = path.join(BUILD, `frames-${format.id}.mkv`);
  const score = path.join(BUILD, "score.wav");
  for (const f of [frames, score]) if (!fs.existsSync(f)) throw new Error(`${path.relative(process.cwd(), f)} is missing: run promo/capture.mjs and promo/score.mjs first`);
  fs.mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, `hugging-force-promo-${format.id}.mp4`);
  await run([
    "-i",
    frames,
    "-i",
    score,
    "-filter_complex",
    `[0:v]scale=${W}:${H}:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p[v]`,
    "-map",
    "[v]",
    "-map",
    "1:a",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-profile:v",
    "high",
    // Level 4.1: the usual ceiling for 1080p30 on phones, TVs and social uploads.
    "-level:v",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-color_range",
    "tv",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(SECONDS),
    "-movflags",
    "+faststart",
    "-metadata",
    "title=Hugging Force",
    "-metadata",
    "comment=huggingforce.com. An independent project, not affiliated with Hugging Face.",
    mp4,
  ]);

  // The file is what it should be.
  const info = probe(mp4);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const problems = [];
  if (v.width !== W || v.height !== H) problems.push(`video is ${v.width} x ${v.height}`);
  if (v.pix_fmt !== "yuv420p" || v.color_space !== "bt709") problems.push(`video is ${v.pix_fmt}, ${v.color_space}`);
  if (Number(v.nb_read_frames) !== FPS * SECONDS) problems.push(`${v.nb_read_frames} frames, expected ${FPS * SECONDS}`);
  if (Math.abs(Number(info.format.duration) - SECONDS) > 0.05) problems.push(`duration ${info.format.duration} s`);
  if (!a || a.codec_name !== "aac" || Number(a.sample_rate) !== 48000 || a.channels !== 2) problems.push("audio is not AAC 48 kHz stereo");
  const loud = loudness(mp4);
  if (Math.abs(loud.lufs - MUSIC.lufs) > 1) problems.push(`soundtrack at ${loud.lufs} LUFS`);
  if (loud.peak > MUSIC.truePeak) problems.push(`soundtrack true peak ${loud.peak} dBTP`);
  const flash = await flashes(mp4, portrait);
  if (flash.found.length) problems.push(`frames that flash: ${flash.found.map((f) => `${f.t} s`).join(", ")}`);
  if (problems.length) throw new Error(`${path.relative(process.cwd(), mp4)}:\n  ${problems.join("\n  ")}`);

  // Poster: the title card over the arriving galaxy, from the lossless clip.
  const poster = path.join(OUT, `poster-${format.id}.png`);
  await run(["-ss", "3.2", "-i", frames, "-frames:v", "1", poster]);
  await run(["-i", poster, "-q:v", "2", poster.replace(/\.png$/, ".jpg")]);

  // Contact sheet: a frame every 2 s from 1 s, each labeled with its time.
  const sheet = path.join(OUT, `contact-${format.id}.png`);
  const font = ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => fs.existsSync(f));
  const label = font ? `,drawtext=fontfile=${font}:text='%{pts\\:hms}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=5` : "";
  const pick = `select='gte(t\\,1)*(isnan(prev_selected_t)+gte(t-prev_selected_t\\,1.999))'`;
  const tiles = portrait ? "scale=270:-2" + label + ",tile=8x2" : "scale=480:-2" + label + ",tile=5x3";
  await run(["-i", mp4, "-vf", `${pick},${tiles}:padding=6:margin=6:color=white`, "-frames:v", "1", sheet]);

  const mb = (Number(info.format.size) / 1e6).toFixed(1);
  console.log(`${path.relative(process.cwd(), mp4)}: ${W} x ${H}, ${v.nb_read_frames} frames, ${Number(info.format.duration).toFixed(2)} s, ${mb} MB`);
  console.log(`  video ${v.codec_name} ${v.profile} ${v.level / 10}, ${v.pix_fmt}, ${v.color_space}; audio ${a.codec_name} ${a.sample_rate} Hz, ${loud.lufs} LUFS, true peak ${loud.peak} dBTP`);
  console.log(`  no flashes (largest frame-to-frame change ${flash.largest})`);
  console.log(`  ${path.relative(process.cwd(), poster)}, ${path.relative(process.cwd(), sheet)}`);
  return { mp4, poster, sheet };
}

if (import.meta.url === `file://${process.argv[1]}`) await assemble(formatFrom(process.argv.slice(2)));
