/* The landing page. Its hero is the live universe, drifting behind the headline; below it, how to
   read the universe, the catalog of every star, and what the project is built on. */
import { ArrowRight, ArrowUpRight, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { CATALOG, TOTAL_DERIVATIVES } from "../data/catalog.ts";
import { day, exact } from "../lib/format.ts";
import type { EngineStatus } from "../hooks/useEngine.ts";
import type { UniverseEngine } from "../three/engine.ts";
import { Catalog } from "./Catalog.tsx";
import { Legend } from "./Legend.tsx";
import { Mark } from "./Mark.tsx";
import { SceneHost } from "./SceneHost.tsx";

export const REPO = "https://github.com/fritzhand/hugging-force";

interface Props {
  engine: UniverseEngine | null;
  status: EngineStatus;
  onEnter(model?: string): void;
}

const PROTOCOLS = [
  {
    name: "Hugging Face Hub API",
    href: "https://huggingface.co/docs/hub/api",
    body: "Every number: downloads, likes, parameters, trending scores, licenses. The model tree is the Hub's own base_model relations (fine-tune, adapter, quantized, merge), counted family by family.",
  },
  {
    name: "Hugging Face task taxonomy",
    href: "https://github.com/huggingface/huggingface.js/blob/main/packages/tasks/src/pipelines.ts",
    body: "The arms. Each pipeline tag's modality comes from the huggingface.js tasks package, so the galaxy groups models the way the Hub does.",
  },
  {
    name: "Keplerian orbits",
    href: "https://en.wikipedia.org/wiki/Orbital_elements",
    body: "Each derivative has six orbital elements and moves by Kepler's equation, solved on the GPU; periods follow Kepler's third law.",
  },
  {
    name: "Planck's law and CIE 1931",
    href: "http://www.vendian.org/mncharity/dir3/blackbody/",
    body: "Star colors are blackbody colors: Planck's law against the CIE 1931 color-matching functions, checked against Mitchell Charity's table.",
  },
  {
    name: "Pogson magnitudes and Morgan–Keenan classes",
    href: "https://en.wikipedia.org/wiki/Apparent_magnitude",
    body: "Brightness reads on the astronomers' logarithmic scale, and temperature as the spectral classes O, B, A, F, G, K and M.",
  },
  {
    name: "Open Exoplanet Catalogue",
    href: "https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue",
    body: "The catalog's shape: an open, versioned file of systems, each a star with what orbits it, rebuilt from public data by one script.",
  },
  {
    name: "Design Tokens Format 2025.10",
    href: "https://www.designtokens.org/tr/2025.10/format/",
    body: "The design system is one tokens file in the W3C community group's format; the page's CSS and the scene's colors are generated from it.",
  },
];

export function Landing({ engine, status, onEnter }: Props) {
  const hero = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Hugging Force · the open-model universe";
  }, []);

  // The galaxy fills the desktop hero beside the copy; on narrow screens it sits above it.
  useEffect(() => {
    if (!engine) return;
    engine.setMode("hero");
    engine.setArm(null);
    engine.showGalaxy();
    const h = hero.current;
    const t = text.current;
    if (!h || !t) return;
    const measure = () => {
      // Insets and blocked areas are relative to the canvas, which on narrow screens is shorter than the hero.
      const scene = h.querySelector(".hero-scene") ?? h;
      const sr = scene.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const header = document.querySelector(".site-header")?.getBoundingClientRect();
      const wide = sr.width >= 900;
      const top = header ? header.bottom - sr.top + 8 : 72;
      engine.setInsets(wide ? { top, right: 24, bottom: 40, left: Math.min(tr.right - sr.left, sr.width * 0.46) } : { top, right: 8, bottom: Math.max(0, sr.bottom - tr.top + 8), left: 8 });
      const blocked = [{ l: tr.left - sr.left - 12, t: tr.top - sr.top - 12, r: tr.right - sr.left + 12, b: tr.bottom - sr.top + 12 }];
      if (header) blocked.push({ l: header.left - sr.left, t: header.top - sr.top, r: header.right - sr.left, b: header.bottom - sr.top });
      engine.setBlocked(blocked);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(h);
    ro.observe(t);
    return () => ro.disconnect();
  }, [engine]);

  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Hugging Force, home">
          <Mark size={30} />
          <span className="brand-name">Hugging Force</span>
        </a>
        <nav className="site-nav" aria-label="Sections">
          <a className="nav-link nav-optional" href="#how">
            How to read it
          </a>
          <a className="nav-link nav-optional" href="#catalog">
            Catalog
          </a>
          <a className="nav-link" href={REPO}>
            GitHub
          </a>
          <button type="button" className="btn btn-small btn-primary" onClick={() => onEnter()}>
            Enter
          </button>
        </nav>
      </header>

      <main id="content" tabIndex={-1}>
        <section className="hero" ref={hero} aria-labelledby="hero-title">
          {status === "unavailable" ? (
            <div className="hero-scene hero-fallback" aria-hidden="true" />
          ) : (
            <SceneHost engine={engine} className="hero-scene" label="A spiral galaxy of Hugging Face models. Drag sideways to turn it; select a star to fly to its system. Every model is also in the catalog below." />
          )}
          <div className="hero-scrim" aria-hidden="true" />
          <div className="hero-inner">
            <div className="hero-text" ref={text}>
              <p className="eyebrow">Hugging Face, drawn as a galaxy</p>
              <h1 id="hero-title">
                The <span className="nowrap">open-model</span> <span className="warm">universe.</span>
              </h1>
              <p className="lede">Every star is a model on Hugging Face. Around it orbits everything built on it: fine-tunes, adapters, quantizations and merges, one point per model.</p>
              <div className="cta-row">
                <button type="button" className="btn btn-primary btn-large" onClick={() => onEnter()}>
                  Enter the universe <ArrowRight size={18} />
                </button>
                <a className="btn btn-glass btn-large" href="#how">
                  How to read it
                </a>
              </div>
              <p className="hero-meta">
                <span>{CATALOG.systems.length} stars</span>
                <span>{exact(TOTAL_DERIVATIVES)} models in orbit</span>
                <span>Hub data from {day(CATALOG.fetchedAt)}</span>
              </p>
            </div>
          </div>
          {status === "ready" ? (
            <div className="hero-tools">
              <p className="hero-hint">
                <span className="hint-desktop">Drag to turn</span>
                <span className="hint-touch">Swipe sideways to turn</span> · Select a star
              </p>
              <div className="icon-group" role="group" aria-label="Universe view">
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
            </div>
          ) : null}
        </section>

        <section className="section" id="how" aria-labelledby="how-title">
          <div className="container">
            <p className="section-kicker">The map</p>
            <h2 id="how-title">How to read the universe</h2>
            <p className="section-lede">Hugging Force draws real Hub data with the conventions astronomers use for real skies. Six encodings, each with its own scale.</p>
            <Legend variant="cards" />
          </div>
        </section>

        <section className="section" id="catalog" aria-labelledby="catalog-title">
          <div className="container">
            <p className="section-kicker">The catalog</p>
            <h2 id="catalog-title">{CATALOG.systems.length} stars, picked by hand</h2>
            <p className="section-lede">
              A spread across modalities and years: classics, favorites and models that were trending when the list was made. Their numbers and model trees come from the Hub API, refreshed daily (last on {day(CATALOG.fetchedAt)}); nothing is typed in by hand.
            </p>
            <Catalog systems={CATALOG.systems} onOpen={(id) => onEnter(id)} />
          </div>
        </section>

        <section className="section" id="protocols" aria-labelledby="protocols-title">
          <div className="container">
            <p className="section-kicker">Built in the open</p>
            <h2 id="protocols-title">Open data, open protocols</h2>
            <ul className="protocols">
              {PROTOCOLS.map((p) => (
                <li key={p.name}>
                  <a href={p.href} target="_blank" rel="noreferrer">
                    {p.name} <ArrowUpRight size={15} />
                  </a>
                  <p>{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <Mark size={26} />
            <span>Hugging Force</span>
          </div>
          <p>
            An independent open-source project, not affiliated with or endorsed by Hugging Face. Model data from the{" "}
            <a href="https://huggingface.co/docs/hub/api">Hugging Face Hub API</a>, fetched {day(CATALOG.fetchedAt)}. Hugging Face is a trademark of Hugging Face, Inc.
          </p>
          <a className="text-btn" href={REPO}>
            Source on GitHub <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
    </>
  );
}
