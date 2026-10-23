/* Checks a catalog before it ships: a strict key whitelist per record, types and ranges, known
   modalities and relations, unique ids, Hub ids that look like Hub ids, and families whose named
   members are consistent with their counts. Returns every problem found (empty when it passes).

   Used by scripts/validate-catalog.mjs (before every build) and by validate.test.ts. Plain,
   erasable TypeScript: Node runs it as is. */
import { MODALITIES, RELATIONS } from "./types.ts";

type Json = unknown;

const HUB_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const SYSTEM_KEYS = ["id", "author", "task", "taskName", "modality", "library", "license", "gated", "createdAt", "parameters", "downloads", "downloadsAllTime", "likes", "trendingScore", "parents", "tree"];
const SOURCE_KEYS = ["name", "url", "hub", "taxonomy", "notes"];
const DERIVATIVE_KEYS = ["id", "downloads", "likes", "createdAt"];

const isObject = (v: Json): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: Json): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isText = (v: Json): v is string => typeof v === "string" && v.trim().length > 0;

function keys(where: string, v: Record<string, Json>, allowed: readonly string[], problems: string[]): void {
  for (const k of Object.keys(v)) if (!allowed.includes(k)) problems.push(`${where}: unexpected key "${k}"`);
  for (const k of allowed) if (!(k in v)) problems.push(`${where}: missing "${k}"`);
}

function date(where: string, v: Json, problems: string[], nullable = false): void {
  if (v === null && nullable) return;
  if (typeof v !== "string" || !ISO.test(v) || Number.isNaN(Date.parse(v))) problems.push(`${where}: not an ISO date: ${JSON.stringify(v)}`);
}

function derivative(where: string, d: Json, problems: string[]): void {
  if (!isObject(d)) {
    problems.push(`${where}: not an object`);
    return;
  }
  keys(where, d, DERIVATIVE_KEYS, problems);
  if (typeof d.id !== "string" || !HUB_ID.test(d.id)) problems.push(`${where}: bad id ${JSON.stringify(d.id)}`);
  if (!isCount(d.downloads)) problems.push(`${where}: downloads must be a count`);
  if (!isCount(d.likes)) problems.push(`${where}: likes must be a count`);
  date(`${where}.createdAt`, d.createdAt, problems, true);
}

function system(where: string, s: Json, problems: string[]): string | null {
  if (!isObject(s)) {
    problems.push(`${where}: not an object`);
    return null;
  }
  keys(where, s, SYSTEM_KEYS, problems);
  const id = typeof s.id === "string" ? s.id : null;
  const at = id ? `${where} (${id})` : where;
  if (!id || !HUB_ID.test(id)) problems.push(`${at}: bad id ${JSON.stringify(s.id)}`);
  if (!isText(s.author) || (id && !id.startsWith(`${s.author}/`))) problems.push(`${at}: author must be the id's owner`);
  if (!isText(s.task) || !/^[a-z0-9-]+$/.test(s.task)) problems.push(`${at}: bad task ${JSON.stringify(s.task)}`);
  if (!isText(s.taskName)) problems.push(`${at}: missing taskName`);
  if (!MODALITIES.includes(s.modality as never)) problems.push(`${at}: modality ${JSON.stringify(s.modality)} has no arm`);
  if (s.library !== null && !isText(s.library)) problems.push(`${at}: library must be text or null`);
  if (s.license !== null && !isText(s.license)) problems.push(`${at}: license must be text or null`);
  if (s.gated !== false && s.gated !== "auto" && s.gated !== "manual") problems.push(`${at}: gated must be false, "auto" or "manual"`);
  date(`${at}.createdAt`, s.createdAt, problems);
  if (s.parameters !== null && !(isCount(s.parameters) && s.parameters > 0)) problems.push(`${at}: parameters must be a positive count or null`);
  for (const k of ["downloads", "downloadsAllTime", "likes", "trendingScore"] as const) if (!isCount(s[k])) problems.push(`${at}: ${k} must be a count`);
  if (isCount(s.downloads) && isCount(s.downloadsAllTime) && s.downloadsAllTime > 0 && s.downloads > s.downloadsAllTime) problems.push(`${at}: 30-day downloads exceed all-time downloads`);
  if (!Array.isArray(s.parents)) problems.push(`${at}: parents must be a list`);
  else
    s.parents.forEach((p, i) => {
      if (!isObject(p)) return problems.push(`${at}.parents[${i}]: not an object`);
      keys(`${at}.parents[${i}]`, p, ["id", "relation"], problems);
      if (typeof p.id !== "string" || !HUB_ID.test(p.id)) problems.push(`${at}.parents[${i}]: bad id`);
      if (!RELATIONS.includes(p.relation as never)) problems.push(`${at}.parents[${i}]: bad relation ${JSON.stringify(p.relation)}`);
    });
  if (!isObject(s.tree)) problems.push(`${at}: tree must be an object`);
  else {
    keys(`${at}.tree`, s.tree, RELATIONS, problems);
    for (const r of RELATIONS) {
      const f = s.tree[r];
      if (!isObject(f)) continue;
      keys(`${at}.tree.${r}`, f, ["count", "top"], problems);
      if (!isCount(f.count)) problems.push(`${at}.tree.${r}: count must be a count`);
      if (!Array.isArray(f.top)) {
        problems.push(`${at}.tree.${r}: top must be a list`);
        continue;
      }
      if (f.top.length > 5) problems.push(`${at}.tree.${r}: more than five named members`);
      if (isCount(f.count) && f.top.length > f.count) problems.push(`${at}.tree.${r}: more named members than the count`);
      f.top.forEach((d, i) => derivative(`${at}.tree.${r}.top[${i}]`, d, problems));
      const seen = new Set<unknown>();
      for (const d of f.top) {
        const did = isObject(d) ? d.id : undefined;
        if (seen.has(did)) problems.push(`${at}.tree.${r}: ${String(did)} named twice`);
        seen.add(did);
        if (did === id) problems.push(`${at}.tree.${r}: a model cannot orbit itself`);
      }
    }
  }
  return id;
}

/** Every problem in `catalog`; an empty list means it may ship. */
export function validateCatalog(catalog: Json): string[] {
  const problems: string[] = [];
  if (!isObject(catalog)) return ["the catalog is not an object"];
  keys("catalog", catalog, ["format", "fetchedAt", "source", "systems"], problems);
  if (catalog.format !== "hugging-force/catalog@1") problems.push(`catalog: unknown format ${JSON.stringify(catalog.format)}`);
  date("catalog.fetchedAt", catalog.fetchedAt, problems);
  if (!isObject(catalog.source)) problems.push("catalog.source must be an object");
  else {
    keys("catalog.source", catalog.source, SOURCE_KEYS, problems);
    for (const k of SOURCE_KEYS) if (!isText(catalog.source[k])) problems.push(`catalog.source.${k} must be text`);
    for (const k of ["url", "hub", "taxonomy"]) if (typeof catalog.source[k] === "string" && !String(catalog.source[k]).startsWith("https://")) problems.push(`catalog.source.${k} must be an https URL`);
  }
  if (!Array.isArray(catalog.systems) || catalog.systems.length === 0) {
    problems.push("catalog.systems must be a non-empty list");
    return problems;
  }
  const ids = new Set<string>();
  catalog.systems.forEach((s, i) => {
    const id = system(`systems[${i}]`, s, problems);
    if (!id) return;
    if (ids.has(id)) problems.push(`systems[${i}]: ${id} is listed twice`);
    ids.add(id);
  });
  const fetched = typeof catalog.fetchedAt === "string" ? Date.parse(catalog.fetchedAt) : NaN;
  if (Number.isFinite(fetched))
    catalog.systems.forEach((s, i) => {
      if (isObject(s) && typeof s.createdAt === "string" && Date.parse(s.createdAt) > fetched) problems.push(`systems[${i}]: created after the snapshot`);
    });
  return problems;
}
