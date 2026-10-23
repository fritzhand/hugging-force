/* The address is the state: the landing page, or the universe with an optional model and arm.

   /                            the landing page (its hero is the live galaxy)
   /?universe                   the universe, full screen
   /?universe&model=<hub id>    turned to a model's system, its panel open
   /?universe&arm=<modality>    one arm in focus
   /?model=<hub id>             the landing page's hero turned to a model (from the catalog list) */
import { MODALITIES, type Modality } from "../data/types.ts";

export interface Route {
  universe: boolean;
  model: string | null;
  arm: Modality | null;
}

export const HOME: Route = { universe: false, model: null, arm: null };

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function parseRoute(search: string): Route {
  const q = new URLSearchParams(search);
  const model = q.get("model");
  const arm = q.get("arm");
  return {
    universe: q.has("universe"),
    model: model && MODEL.test(model) ? model : null,
    arm: MODALITIES.includes(arm as Modality) ? (arm as Modality) : null,
  };
}

export function routeSearch(r: Route): string {
  const parts: string[] = [];
  if (r.universe) parts.push("universe");
  // Hub ids keep their slash readable.
  if (r.model) parts.push(`model=${encodeURIComponent(r.model).replace("%2F", "/")}`);
  if (r.arm) parts.push(`arm=${r.arm}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export function sameRoute(a: Route, b: Route): boolean {
  return a.universe === b.universe && a.model === b.model && a.arm === b.arm;
}
