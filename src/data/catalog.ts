/* The bundled catalog (src/data/catalog.json, written by scripts/fetch-catalog.mjs and checked
   by scripts/validate-catalog.mjs before every build). The app reads model data only from here. */
import raw from "./catalog.json";
import { RELATIONS, type Catalog, type ModelSystem } from "./types.ts";

export const CATALOG = raw as unknown as Catalog;

/** Every derivative of a model the Hub lists, all families. */
export function derivatives(s: ModelSystem): number {
  return RELATIONS.reduce((a, r) => a + s.tree[r].count, 0);
}

export const TOTAL_DERIVATIVES = CATALOG.systems.reduce((a, s) => a + derivatives(s), 0);

const BY_ID = new Map(CATALOG.systems.map((s) => [s.id, s]));

export function systemById(id: string | null): ModelSystem | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}
