/* The universe, full screen: the galaxy or one system, with search, the arms, the legend and a
   panel for the selected model (or the list of every star). Everything the canvas shows is also
   reachable from the panel and the search, by keyboard. */
import { BookOpen, ChevronDown, ChevronUp, Minus, PanelRightClose, PanelRightOpen, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, TOTAL_DERIVATIVES, systemById } from "../data/catalog.ts";
import { MODALITIES, type Modality, type Relation } from "../data/types.ts";
import { compact, day, exact, splitId } from "../lib/format.ts";
import { MODALITY } from "../lib/modality.ts";
import type { Route } from "../lib/route.ts";
import { useMedia } from "../hooks/useMedia.ts";
import type { EngineStatus } from "../hooks/useEngine.ts";
import type { UniverseEngine } from "../three/engine.ts";
import { ArmIcon } from "./Icons.tsx";
import { Legend } from "./Legend.tsx";
import { Mark } from "./Mark.tsx";
import { ModelPanel } from "./ModelPanel.tsx";
import { SceneHost } from "./SceneHost.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { StarGlyph } from "./StarGlyph.tsx";

interface Props {
  route: Route;
  engine: UniverseEngine | null;
  status: EngineStatus;
  planet: string | null;
  onRoute(next: Route, opts?: { replace?: boolean }): void;
  onPlanet(id: string | null): void;
  onLeave(): void;
}

/** Whether the panel is open, remembered per viewer (a convenience: the page works without storage). */
const PANEL_KEY = "hf:panel";

function readPanelOpen(): boolean {
  try {
    return window.localStorage.getItem(PANEL_KEY) !== "closed";
  } catch {
    return true;
  }
}

function savePanelOpen(open: boolean): void {
  try {
    window.localStorage.setItem(PANEL_KEY, open ? "open" : "closed");
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the choice lasts for the visit.
  }
}

function StarList({ arm, onPick }: { arm: Modality | null; onPick(id: string): void }) {
  const list = useMemo(() => CATALOG.systems.filter((s) => !arm || s.modality === arm).sort((a, b) => b.downloads - a.downloads), [arm]);
  return (
    <div className="panel-body">
      <h2 className="panel-title">{arm ? `The ${MODALITY[arm].label} arm` : "The galaxy"}</h2>
      <p className="panel-intro">
        {arm
          ? `${list.length} stars. Hugging Face groups their tasks under ${MODALITY[arm].hub}.`
          : `${CATALOG.systems.length} stars and ${exact(TOTAL_DERIVATIVES)} models in orbit, from the Hub on ${day(CATALOG.fetchedAt)}. Select a star, or one below.`}
      </p>
      <ol className="star-list">
        {list.map((s) => {
          const [owner, name] = splitId(s.id);
          return (
            <li key={s.id}>
              <button type="button" className="star-row" onClick={() => onPick(s.id)}>
                <StarGlyph system={s} size={34} />
                <span className="star-row-text">
                  <span className="model-id">
                    <span className="model-owner">{owner}/</span>
                    <span className="model-name">{name}</span>
                  </span>
                  <span className="star-row-meta">
                    <span className="swatch" style={{ background: `var(--color-arm-${s.modality})` }} />
                    {s.taskName} · {compact(s.downloads)} downloads
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Universe({ route, engine, status, planet, onRoute, onPlanet, onLeave }: Props) {
  const [legend, setLegend] = useState(false);
  const [family, setFamily] = useState<Relation | null>(null);
  // The panel (a sidebar on wide screens, a bottom sheet on narrow ones) can be put away so the
  // universe has the whole screen; a small button brings it back.
  const [panelOpen, setPanelOpen] = useState(readPanelOpen);
  const toggled = useRef(false);
  const wide = useMedia("(min-width: 900px)");
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const panel = useRef<HTMLElement>(null);
  const arms = useRef<HTMLDivElement>(null);
  const hideBtn = useRef<HTMLButtonElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const system = systemById(route.model);

  const togglePanel = (open: boolean) => {
    toggled.current = true;
    setPanelOpen(open);
    savePanelOpen(open);
  };

  // Keep focus on the control that toggles the panel, wherever it now is.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    (panelOpen ? hideBtn.current : reopen.current)?.focus();
  }, [panelOpen]);

  useEffect(() => {
    document.title = system ? `${system.id} · Hugging Force` : "The universe · Hugging Force";
  }, [system]);

  // The engine follows the address.
  useEffect(() => {
    if (!engine) return;
    engine.setMode("explore");
  }, [engine]);
  useEffect(() => {
    if (!engine) return;
    if (system) engine.showSystem(system.id);
    else engine.showGalaxy();
    setFamily(null);
    onPlanet(null);
  }, [engine, system, onPlanet]);
  useEffect(() => {
    engine?.setArm(route.arm);
  }, [engine, route.arm]);
  useEffect(() => {
    engine?.setFamily(family);
  }, [engine, family]);
  useEffect(() => {
    engine?.pickPlanet(planet);
  }, [engine, planet]);

  // Frame the space the HUD leaves free.
  useEffect(() => {
    if (!engine) return;
    const measure = () => {
      const rootEl = root.current;
      if (!rootEl) return;
      const r = rootEl.getBoundingClientRect();
      const b = bar.current?.getBoundingClientRect();
      const a = arms.current?.getBoundingClientRect();
      const o = reopen.current?.getBoundingClientRect();
      // The panel's layout box (offsets ignore the slide transform, so an opening panel counts at once).
      const el = panelOpen ? panel.current : null;
      const p = el ? { left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight } : null;
      const top = b ? b.bottom - r.top : 0;
      if (wide) engine.setInsets({ top, right: p ? rootEl.clientWidth - p.left : 0, bottom: 56, left: 0 });
      else engine.setInsets({ top, right: 0, bottom: p ? rootEl.clientHeight - p.top : o ? r.bottom - o.top : 0, left: 0 });
      const rects = [b, a, o].filter((x): x is DOMRect => !!x).map((x) => ({ l: x.left - r.left, t: x.top - r.top, r: x.right - r.left, b: x.bottom - r.top }));
      if (p) rects.push({ l: p.left, t: p.top, r: p.right, b: p.bottom });
      engine.setBlocked(rects);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [root.current, bar.current, panel.current, arms.current, reopen.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [engine, wide, system, panelOpen]);

  // Escape closes the legend, then leaves the system.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "INPUT") return;
      if (legend) setLegend(false);
      else if (route.model) onRoute({ ...route, model: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [legend, route, onRoute]);

  const pick = (id: string) => onRoute({ ...route, model: id });
  const panelLabel = system ? splitId(system.id)[1] : route.arm ? `The ${MODALITY[route.arm].label} arm` : `All ${CATALOG.systems.length} stars`;

  return (
    <div className={`universe ${panelOpen ? "" : "is-panel-closed"}`} ref={root}>
      {status === "unavailable" ? (
        <div className="universe-fallback">
          <p>This browser cannot draw the 3D universe (it needs WebGL 2). Every model is in the list.</p>
        </div>
      ) : (
        <SceneHost engine={engine} className="universe-scene" label="The universe of Hugging Face models. Drag to turn, scroll or pinch to zoom, select a star to fly to its system. The panel lists every model." />
      )}

      <header className="hud-bar" ref={bar}>
        <button type="button" className="brand brand-btn" onClick={onLeave} aria-label="Hugging Force, back to the landing page">
          <Mark size={28} />
          <span className="brand-name">Hugging Force</span>
        </button>
        <SearchBox systems={CATALOG.systems} onPick={pick} />
        <div className="hud-actions">
          <button type="button" className={`btn btn-glass btn-small ${legend ? "is-on" : ""}`} aria-expanded={legend} aria-controls="legend-panel" onClick={() => setLegend((v) => !v)}>
            <BookOpen size={16} /> <span className="hide-narrow">How to read it</span>
          </button>
          <button type="button" className="icon-btn" aria-label="Leave the universe" onClick={onLeave}>
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="hud-arms" ref={arms} role="group" aria-label="Focus an arm">
        {MODALITIES.map((m) => (
          <button key={m} type="button" className={`chip ${route.arm === m ? "is-on" : ""}`} aria-pressed={route.arm === m} onClick={() => onRoute({ ...route, arm: route.arm === m ? null : m }, { replace: true })}>
            <span className="swatch" style={{ background: `var(--color-arm-${m})` }} />
            <ArmIcon arm={m} size={14} />
            {MODALITY[m].label}
          </button>
        ))}
      </div>

      <aside className="hud-panel" id="hud-panel" ref={panel} aria-label={system ? `About ${system.id}` : "Every star"} inert={!panelOpen}>
        <button ref={hideBtn} type="button" className="icon-btn panel-hide" aria-label="Hide the panel" aria-controls="hud-panel" aria-expanded={panelOpen} onClick={() => togglePanel(false)}>
          {wide ? <PanelRightClose size={18} /> : <ChevronDown size={20} />}
        </button>
        <div className="panel-scroll">
          {system ? (
            <ModelPanel
              system={system}
              fetchedAt={CATALOG.fetchedAt}
              family={family}
              planet={planet}
              onFamily={setFamily}
              onPlanet={onPlanet}
              onSelect={pick}
              onBack={() => onRoute({ ...route, model: null })}
            />
          ) : (
            <StarList arm={route.arm} onPick={pick} />
          )}
        </div>
      </aside>

      {panelOpen ? null : (
        <button ref={reopen} type="button" className="panel-reopen" aria-controls="hud-panel" aria-expanded={false} onClick={() => togglePanel(true)}>
          {wide ? <PanelRightOpen size={18} /> : <ChevronUp size={20} />}
          <span className="panel-reopen-label">
            <span className="sr-only">Show the panel: </span>
            {panelLabel}
          </span>
        </button>
      )}

      {legend ? (
        <div className="legend-panel" id="legend-panel" role="dialog" aria-label="How to read the universe">
          <div className="legend-panel-head">
            <h2>How to read the universe</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setLegend(false)}>
              <X size={18} />
            </button>
          </div>
          <Legend variant="compact" />
        </div>
      ) : null}

      {status === "ready" ? (
        <div className="hud-tools icon-group" role="group" aria-label="View">
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => engine?.zoom(0.8)}>
            <Plus size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => engine?.zoom(1.25)}>
            <Minus size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="Reset the view" onClick={() => engine?.reset()}>
            <RotateCcw size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
