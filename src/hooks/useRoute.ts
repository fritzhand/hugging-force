/* The address is the state (lib/route.ts): read it, follow Back and Forward, and change it. */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseRoute, routeSearch, sameRoute, type Route } from "../lib/route.ts";

export function routeHref(r: Route): string {
  return `${import.meta.env.BASE_URL}${routeSearch(r)}`;
}

export function useRoute(): [Route, (next: Route, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.search));
  const current = useRef(route);
  useEffect(() => {
    const onPop = () => {
      current.current = parseRoute(window.location.search);
      setRoute(current.current);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // History is written here, never inside a state updater (React may call those twice).
  const navigate = useCallback((next: Route, opts?: { replace?: boolean }) => {
    if (sameRoute(current.current, next)) return;
    const url = routeHref(next);
    if (opts?.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    current.current = next;
    setRoute(next);
  }, []);
  return [route, navigate];
}
