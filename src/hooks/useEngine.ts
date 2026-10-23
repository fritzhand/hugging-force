/* One universe engine for the visit, created after the page's first paint (three.js loads as its
   own chunk) and rebuilt if the browser never restores a lost WebGL context. */
import { useEffect, useRef, useState } from "react";
import type { Catalog } from "../data/types.ts";
import type { EngineHooks, UniverseEngine } from "../three/engine.ts";
import { hasWebGL2 } from "../three/webgl.ts";

export type EngineStatus = "loading" | "ready" | "unavailable";

export function useEngine(catalog: Catalog, reduced: boolean, hooks: EngineHooks): { engine: UniverseEngine | null; status: EngineStatus } {
  const [engine, setEngine] = useState<UniverseEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>(() => (hasWebGL2() ? "loading" : "unavailable"));
  const [generation, setGeneration] = useState(0);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    if (status === "unavailable") return;
    let made: UniverseEngine | null = null;
    let cancelled = false;
    import("../three/engine.ts")
      .then(({ UniverseEngine }) => {
        if (cancelled) return;
        made = new UniverseEngine(
          catalog,
          {
            onSelect: (id) => hooksRef.current.onSelect(id),
            onPlanet: (id) => hooksRef.current.onPlanet?.(id),
            onGiveUp: () => setGeneration((g) => g + 1),
          },
          reducedRef.current,
        );
        setEngine(made);
        setStatus("ready");
      })
      .catch((err) => {
        console.error("The universe could not start:", err);
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      made?.dispose();
      setEngine(null);
    };
    // A new generation replaces an engine whose context was lost for good.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, generation]);

  useEffect(() => {
    engine?.setReducedMotion(reduced);
  }, [engine, reduced]);

  return { engine, status };
}
