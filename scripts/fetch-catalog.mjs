#!/usr/bin/env node
/* Snapshots the curated models from the Hugging Face Hub API into src/data/catalog.json.

   For each id in data/curated.json it reads the model's public metadata (task, library, license,
   parameters, downloads, likes, trending score, creation date) and its model tree: the models the
   Hub lists as fine-tunes, adapters, quantizations and merges of it. Each family is counted by
   paging through the Hub's own filter (`base_model:<relation>:<id>`), the same lists the model
   page links to, and its five most downloaded members are kept by name.

   Nothing is written by hand: every number in the catalog is what the API returned on the day
   the script ran (`fetchedAt`). Run it again to refresh: `npm run catalog`.
   No token is needed or read; the script only calls public, unauthenticated endpoints.

   The site is public and family-friendly, so a family's named members skip models the Hub marks
   `not-for-all-audiences` and models whose names advertise adult content or removed safety
   tuning (UNNAMED below), and any id listed in data/curated.json's `unnamed`. They still count:
   the totals are the Hub's. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const API = "https://huggingface.co/api/models";
const HUB = "https://huggingface.co";
const RELATIONS = ["finetune", "adapter", "quantized", "merge"];
const TOP = 5;
const PAGE = 1000;
const MODEL_FIELDS = ["author", "downloads", "downloadsAllTime", "likes", "pipeline_tag", "library_name", "createdAt", "safetensors", "trendingScore", "gated", "cardData", "tags"];
const CHILD_FIELDS = ["downloads", "likes", "createdAt", "tags"];
/** How far down a family's most downloaded members the script looks for TOP it may name. */
const CANDIDATES = 100;
/** Words matched at the start of a word ("lustify" but not "illustrious"); camelCase counts as words. */
const UNNAMED = /(?<![a-z])(nsfw|not-for-all-audiences|uncen|abliterat|heretic|heresy|porn|nud[ei]|naked|sex|hentai|erotic|lewd|xxx|onlyfans|undress|lust|waifu|gore)/i;
const flagged = (s) => UNNAMED.test(s.replace(/([a-z])([A-Z])/g, "$1 $2"));

const curated = JSON.parse(await readFile(`${root}data/curated.json`, "utf8"));
const taxonomy = JSON.parse(await readFile(`${root}data/tasks.json`, "utf8"));
const ARMS = ["nlp", "cv", "audio", "multimodal"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET with retries on rate limits and server errors. Returns the Response. */
async function get(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "hugging-force-catalog/0.1 (+https://github.com/fritzhand/hugging-force)" } });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const wait = 2000 * 2 ** attempt;
    console.warn(`  ${res.status} on ${url}; retrying in ${wait / 1000}s`);
    await sleep(wait);
    return get(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

const expand = (fields) => fields.map((f) => `expand[]=${encodeURIComponent(f)}`).join("&");

/** The next page's URL from a Link header, or null. */
function nextLink(header) {
  if (!header) return null;
  const m = header.match(/<([^>]+)>\s*;\s*rel="next"/);
  return m ? m[1] : null;
}

/** Every model the Hub lists as `relation` of `id`: the total count and the `TOP` most downloaded it may name. */
async function family(relation, id) {
  const filter = `filter=${encodeURIComponent(`base_model:${relation}:${id}`)}&sort=downloads&direction=-1`;
  const head = await (await get(`${API}?${filter}&limit=${CANDIDATES}&${expand(CHILD_FIELDS)}`)).json();
  if (!Array.isArray(head)) throw new Error(`unexpected list for ${relation} of ${id}`);
  const top = head.filter(nameable).slice(0, TOP).map(child);
  // Count with the smallest payload the API offers (ids and downloads only).
  let url = `${API}?${filter}&limit=${PAGE}&expand[]=downloads`;
  let count = 0;
  for (let pages = 0; url; pages++) {
    if (pages > 400) throw new Error(`more than ${pages * PAGE} ${relation} models for ${id}; refusing to page further`);
    await sleep(120);
    const res = await get(url);
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error(`unexpected list for ${relation} of ${id}`);
    count += list.length;
    url = nextLink(res.headers.get("link"));
  }
  return { count, top };
}

/** Ids curators chose never to name, whatever their rank (data/curated.json `unnamed`). */
const NEVER_NAMED = new Set(curated.unnamed ?? []);

function nameable(m) {
  return !NEVER_NAMED.has(m.id) && !flagged(m.id) && !(m.tags ?? []).some(flagged);
}

function child(m) {
  return {
    id: m.id,
    downloads: num(m.downloads),
    likes: num(m.likes),
    createdAt: m.createdAt ?? null,
  };
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The models this one is built on, from the Hub's own tags (they use canonical ids). */
function parents(tags) {
  const out = [];
  for (const t of tags ?? []) {
    const m = /^base_model:(finetune|adapter|quantized|merge):(.+)$/.exec(t);
    if (m) out.push({ id: m[2], relation: m[1] });
  }
  return out;
}

function license(model) {
  const fromCard = model.cardData?.license;
  if (typeof fromCard === "string") return fromCard;
  if (Array.isArray(fromCard) && typeof fromCard[0] === "string") return fromCard[0];
  const tag = (model.tags ?? []).find((t) => t.startsWith("license:"));
  return tag ? tag.slice("license:".length) : null;
}

async function system(id) {
  const res = await get(`${API}/${id}?${expand(MODEL_FIELDS)}`);
  const m = await res.json();
  const task = m.pipeline_tag;
  const info = task ? taxonomy.tasks[task] : null;
  if (!info) throw new Error(`${id}: the Hub gives no known task (pipeline_tag ${JSON.stringify(task)}); pick another model`);
  if (!ARMS.includes(info.modality)) throw new Error(`${id}: modality "${info.modality}" has no arm in the galaxy`);
  const tree = {};
  for (const relation of RELATIONS) {
    tree[relation] = await family(relation, m.id);
    await sleep(120);
  }
  const params = m.safetensors?.total;
  return {
    id: m.id,
    author: m.author ?? m.id.split("/")[0],
    task,
    taskName: info.name,
    modality: info.modality,
    library: m.library_name ?? null,
    license: license(m),
    gated: m.gated === "auto" || m.gated === "manual" ? m.gated : false,
    createdAt: m.createdAt,
    parameters: typeof params === "number" && params > 0 ? params : null,
    downloads: num(m.downloads),
    downloadsAllTime: num(m.downloadsAllTime),
    likes: num(m.likes),
    trendingScore: num(m.trendingScore),
    parents: parents(m.tags),
    tree,
  };
}

const systems = [];
for (const id of curated.models) {
  process.stdout.write(`${id} … `);
  const s = await system(id);
  const total = RELATIONS.reduce((a, r) => a + s.tree[r].count, 0);
  console.log(`${s.taskName}; ${total.toLocaleString("en-US")} derivatives`);
  systems.push(s);
}

const ids = new Set();
for (const s of systems) {
  if (ids.has(s.id)) throw new Error(`${s.id} is listed twice`);
  ids.add(s.id);
}

const catalog = {
  format: "hugging-force/catalog@1",
  fetchedAt: new Date().toISOString(),
  source: {
    name: "Hugging Face Hub API",
    url: API,
    hub: HUB,
    taxonomy: taxonomy._source,
    notes: "downloads: the last 30 days, as the Hub reports them. tree: models whose Hub tags name this model as their base (base_model:<relation>:<id>), counted on the day of the snapshot. tree.*.top: the most downloaded members, skipping models marked not-for-all-audiences or named for adult content or removed safety tuning (they still count).",
  },
  systems,
};

await writeFile(`${root}src/data/catalog.json`, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`\nWrote src/data/catalog.json: ${systems.length} models, fetched ${catalog.fetchedAt}`);
