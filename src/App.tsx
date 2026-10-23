/* Two pages, one universe engine: the landing page (its hero is the live galaxy) and the universe,
   full screen. The address decides which (lib/route.ts). */
import { useCallback, useMemo, useState } from "react";
import { CATALOG } from "./data/catalog.ts";
import { useEngine } from "./hooks/useEngine.ts";
import { useReducedMotion } from "./hooks/useMedia.ts";
import { useRoute } from "./hooks/useRoute.ts";
import { HOME } from "./lib/route.ts";
import { Landing } from "./components/Landing.tsx";
import { Universe } from "./components/Universe.tsx";

export function App() {
  const [route, navigate] = useRoute();
  const reduced = useReducedMotion();
  const [planet, setPlanet] = useState<string | null>(null);

  const hooks = useMemo(
    () => ({
      onSelect: (id: string) => navigate({ universe: true, model: id, arm: null }),
      onPlanet: (id: string | null) => setPlanet(id),
      onGiveUp: () => undefined,
    }),
    [navigate],
  );
  const { engine, status } = useEngine(CATALOG, reduced, hooks);

  const enter = useCallback(
    (model?: string) => {
      navigate({ universe: true, model: model ?? null, arm: null });
      window.scrollTo(0, 0);
    },
    [navigate],
  );
  const leave = useCallback(() => navigate(HOME), [navigate]);

  return route.universe ? (
    <Universe route={route} engine={engine} status={status} planet={planet} onRoute={navigate} onPlanet={setPlanet} onLeave={leave} />
  ) : (
    <Landing engine={engine} status={status} onEnter={enter} />
  );
}
