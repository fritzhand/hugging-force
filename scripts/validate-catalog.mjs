#!/usr/bin/env node
/* Fails the build when src/data/catalog.json has a problem (src/data/validate.ts says which).
   Runs before every build (`prebuild`) and on its own with `npm run validate`. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "../src/data/validate.ts";

const file = fileURLToPath(new URL("../src/data/catalog.json", import.meta.url));
const catalog = JSON.parse(await readFile(file, "utf8"));
const problems = validateCatalog(catalog);
if (problems.length) {
  console.error(`src/data/catalog.json has ${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const derivatives = catalog.systems.reduce((a, s) => a + Object.values(s.tree).reduce((b, f) => b + f.count, 0), 0);
console.log(`catalog ok: ${catalog.systems.length} models, ${derivatives.toLocaleString("en-US")} derivatives, fetched ${catalog.fetchedAt}`);
