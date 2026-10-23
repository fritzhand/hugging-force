/* The universe: one renderer and canvas, shared by the landing page's hero and the full-screen
   universe. It draws, all procedurally (no network assets): a nebula sky and far stars; the
   galaxy's dust, bulge and year rings; the Hub's glow at the core; a star for every model; one body
   in orbit for every derivative the Hub lists; and, in a selected system, its named members.

   Views: the galaxy (every star), or one system (flown to, its orbits up close). The page tells
   the engine which part of the screen its HUD covers (setInsets, setBlocked) and the engine frames
   the free part.

   Rendering: while orbits turn or the camera drifts, the loop runs at up to 30 fps, and at up to
   60 fps during a flight or while the visitor drags. Under reduced motion nothing moves by itself
   (no orbits, no drift, instant camera moves) and frames are drawn only on demand. Nothing renders
   while the canvas is off screen or the page is hidden, and React never updates per frame: labels
   are DOM nodes this engine moves itself.

   Lifecycle: textures are painted on CPU canvases and repainted after a context restore; if the
   context is not restored, hooks.onGiveUp asks for a new engine. dispose() frees everything. */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RELATIONS, type Catalog, type Modality, type Relation } from "../data/types.ts";
import { COLOR } from "../design/tokens.ts";
import { ARM_ORDER, GALAXY, armAngle, dust, yearRings } from "../lib/galaxy.ts";
import { seeded } from "../lib/hash.ts";
import { MODALITY } from "../lib/modality.ts";
import { blackbodyLinear } from "../lib/blackbody.ts";
import { splitId } from "../lib/format.ts";
import { bodyPosition, buildNamed, buildOrbits, buildStars, type Named, type Star } from "../lib/universe.ts";
import { rotate } from "../lib/kepler.ts";
import { watchContext } from "./contextWatch.ts";
import { cpuCanvas } from "./cpuCanvas.ts";
import { LabelLayer, type LabelSpec, type Placement, type Rect } from "./labels.ts";
import { paintCoreGlow, paintRing, paintSky } from "./paint.ts";
import {
  BG_STAR_FRAG,
  BG_STAR_VERT,
  DUST_FRAG,
  DUST_VERT,
  MAX_SYSTEMS,
  ORBIT_FRAG,
  ORBIT_VERT,
  PLANET_FRAG,
  PLANET_VERT,
  SKY_FRAG,
  SKY_VERT,
  STAR_FRAG,
  STAR_VERT,
} from "./shaders.ts";

export type EngineMode = "hero" | "explore";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface EngineHooks {
  /** A star was clicked or tapped (its model's id). */
  onSelect(id: string): void;
  /** A named body in the selected system was clicked or tapped, or null. */
  onPlanet?(id: string | null): void;
  /** The WebGL context was lost and never restored: build a new engine. */
  onGiveUp(): void;
}

type View = { kind: "galaxy" } | { kind: "system"; index: number };

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  from: THREE.Spherical;
  to: THREE.Spherical;
  start: number;
  duration: number;
  arc: number;
}

const FOV = 45;
/** How far above the disc the camera looks at the galaxy, radians: the hero, and the full universe. */
const HERO_ELEVATION = 0.5;
const EXPLORE_ELEVATION = 0.66;
const IDLE_BEFORE_DRIFT_MS = 6000;
const DRIFT = 0.018; // radians per second
const AMBIENT_FPS = 30;
const FAMILY_SIZES = [0.013, 0.0095, 0.017, 0.022];
const FAMILY_ALPHAS = [0.8, 0.42, 0.9, 1.0];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function linear(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

export class UniverseEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 8000);
  private readonly controls: OrbitControls;
  private readonly hooks: EngineHooks;
  private readonly catalog: Catalog;
  private readonly stars: Star[];
  private readonly named: Named[];
  private readonly labels = new LabelLayer();

  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private size = { w: 1, h: 1 };
  private pixelRatio = 1;
  private mode: EngineMode = "hero";
  private view: View = { kind: "galaxy" };
  private reduced: boolean;
  private active = true;
  private disposed = false;
  private raf = 0;
  private running = false;
  private last = 0;
  private lastDraw = 0;
  private time = 0;
  private interacting = false;
  private idleUntil = 0;
  private flight: Flight | null = null;
  private userMoved = false;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** The insets the projection uses now: they ease toward `insets` when a panel opens or closes. */
  private shown: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private blocked: Rect[] = [];
  private armFocus: Modality | null = null;
  private familyFocus: Relation | null = null;
  private hover: { kind: "star"; index: number } | { kind: "planet"; index: number } | null = null;
  private planetPicked: number | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private stopWatch: () => void;

  private readonly sky: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private readonly glow: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private readonly ring: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly dustMaterial: THREE.ShaderMaterial;
  private readonly bgMaterial: THREE.ShaderMaterial;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly orbitMaterial: THREE.ShaderMaterial;
  private readonly planetMaterial: THREE.ShaderMaterial;
  private readonly ringMaterial: THREE.PointsMaterial;
  private readonly selectRing: THREE.Sprite;
  private readonly hoverRing: THREE.Sprite;
  private readonly centers: THREE.Vector3[];

  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly fitCamera = new THREE.PerspectiveCamera();
  /** Points on the galaxy's rim (and the bulge's top and bottom), for framing. */
  private readonly galaxyOutline: THREE.Vector3[] = [
    ...Array.from({ length: 48 }, (_, k) => new THREE.Vector3(Math.cos((k / 48) * Math.PI * 2) * GALAXY.outer * 1.03, 0, Math.sin((k / 48) * Math.PI * 2) * GALAXY.outer * 1.03)),
    new THREE.Vector3(0, 4, 0),
    new THREE.Vector3(0, -4, 0),
  ];

  constructor(catalog: Catalog, hooks: EngineHooks, reduced: boolean) {
    this.catalog = catalog;
    this.hooks = hooks;
    this.reduced = reduced;
    if (catalog.systems.length > MAX_SYSTEMS) throw new Error(`the universe draws at most ${MAX_SYSTEMS} systems`);
    this.stars = buildStars(catalog);
    this.named = buildNamed(catalog, this.stars);
    this.centers = this.stars.map((s) => new THREE.Vector3(...s.pos));
    while (this.centers.length < MAX_SYSTEMS) this.centers.push(new THREE.Vector3());

    this.canvas = document.createElement("canvas");
    this.canvas.className = "hf-canvas";
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(COLOR.sky.deep, 1);

    this.camera.position.set(0, 40, 110);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.6;
    this.controls.addEventListener("change", this.invalidate);
    this.controls.addEventListener("start", () => {
      this.interacting = true;
      this.userMoved = true;
      this.flight = null;
      this.idleUntil = Number.POSITIVE_INFINITY;
    });
    this.controls.addEventListener("end", () => {
      this.interacting = false;
      this.idleUntil = performance.now() + IDLE_BEFORE_DRIFT_MS;
      this.invalidate();
    });

    // Sky.
    const [skyCanvas, skyCtx] = cpuCanvas(2048, 1024);
    paintSky(skyCtx, 2048, 1024);
    this.sky = { canvas: skyCanvas, ctx: skyCtx, texture: this.texture(skyCanvas) };
    const skyMaterial = this.track(new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uMap: { value: this.sky.texture } }, side: THREE.BackSide, depthWrite: false }));
    const skyMesh = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(4000, 32, 16)), skyMaterial);
    skyMesh.renderOrder = -10;
    this.scene.add(skyMesh);

    // Far stars.
    this.bgMaterial = this.track(new THREE.ShaderMaterial({ vertexShader: BG_STAR_VERT, fragmentShader: BG_STAR_FRAG, uniforms: { uPixelRatio: { value: this.pixelRatio } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.buildFarStars());

    // The galaxy's dust.
    this.dustMaterial = this.track(
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: {
          uArmColors: { value: ARM_ORDER.map((m) => linear(COLOR.arm[m])) },
          uBulge: { value: linear(COLOR.core.gold) },
          uField: { value: linear(COLOR.ink.secondary) },
          uArmFocus: { value: -1 },
          uDim: { value: 1 },
          ...this.pointUniforms(1, 0.12, 4),
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.buildDust());

    // Year rings.
    this.ringMaterial = this.track(new THREE.PointsMaterial({ color: COLOR.ink.secondary, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.buildYearRings());

    // The Hub at the core.
    const [glowCanvas, glowCtx] = cpuCanvas(512, 512);
    paintCoreGlow(glowCtx, 512);
    this.glow = { canvas: glowCanvas, ctx: glowCtx, texture: this.texture(glowCanvas) };
    const coreMaterial = this.track(new THREE.SpriteMaterial({ map: this.glow.texture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const core = new THREE.Sprite(coreMaterial);
    core.scale.setScalar(26);
    const coreHot = new THREE.Sprite(coreMaterial);
    coreHot.scale.setScalar(7);
    this.scene.add(core, coreHot);

    // Lineage: a faint bridge from a model to its base when both are stars here.
    this.buildLineage();

    // Orbits.
    this.orbitMaterial = this.track(
      new THREE.ShaderMaterial({
        vertexShader: ORBIT_VERT,
        fragmentShader: ORBIT_FRAG,
        uniforms: {
          uCenters: { value: this.centers },
          uFamilyColors: { value: RELATIONS.map((r) => linear(COLOR.orbit[r])) },
          uTime: { value: 0 },
          uSelected: { value: -1 },
          uFamilyFocus: { value: -1 },
          uArmFocus: { value: -1 },
          uSizes: { value: FAMILY_SIZES },
          uAlphas: { value: FAMILY_ALPHAS },
          ...this.pointUniforms(1, 0.035),
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.buildOrbits());

    // Stars.
    this.starMaterial = this.track(
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        uniforms: { uPxPerUnit: { value: 1 }, uHaloScale: { value: 1 }, uArmFocus: { value: -1 }, uSelected: { value: -1 }, uHover: { value: -1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.buildStars());

    // Named members of the selected system.
    this.planetMaterial = this.track(
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        uniforms: {
          uCenters: { value: this.centers },
          uFamilyColors: { value: RELATIONS.map((r) => linear(COLOR.orbit[r])) },
          uTime: { value: 0 },
          uSelected: { value: -1 },
          uFamilyFocus: { value: -1 },
          uHover: { value: -1 },
          ...this.pointUniforms(2.5, 1),
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.buildPlanets());

    // Selection and hover rings.
    const [ringCanvas, ringCtx] = cpuCanvas(256, 256);
    paintRing(ringCtx, 256);
    this.ring = { canvas: ringCanvas, ctx: ringCtx, texture: this.texture(ringCanvas) };
    this.selectRing = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: this.ring.texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })));
    this.hoverRing = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: this.ring.texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 })));
    this.selectRing.visible = false;
    this.hoverRing.visible = false;
    this.scene.add(this.selectRing, this.hoverRing);

    this.labels.set(this.labelSpecs());

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("pointercancel", this.onPointerLeave);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.stopWatch = watchContext(this.canvas, {
      restored: () => {
        this.repaint();
        this.invalidate();
      },
      giveUp: () => this.hooks.onGiveUp(),
    });

    // Labels use the page's fonts; measure again once they arrive.
    document.fonts?.ready.then(() => {
      if (this.disposed) return;
      this.labels.measure();
      this.invalidate();
    });

    this.applyMode();
    this.frame(this.galaxyFraming(this.mode === "hero" ? HERO_ELEVATION : EXPLORE_ELEVATION, -0.9), true);
  }

  /* ---------- Public API ---------- */

  /** Puts the canvas and labels into `host` and sizes them to it. */
  attach(host: HTMLElement): void {
    if (this.disposed) return;
    if (this.host && this.host !== host) this.detach(this.host);
    this.host = host;
    host.appendChild(this.canvas);
    host.appendChild(this.labels.root);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.labels.measure();
    this.invalidate();
  }

  detach(host: HTMLElement): void {
    if (this.host !== host) return;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.canvas.parentElement === host) host.removeChild(this.canvas);
    this.labels.root.remove();
    this.host = null;
    this.stop();
  }

  /** False while the canvas is off screen: nothing renders. */
  setActive(on: boolean): void {
    this.active = on;
    if (on) this.invalidate();
    else this.stop();
  }

  setReducedMotion(reduced: boolean): void {
    if (this.reduced === reduced) return;
    this.reduced = reduced;
    if (reduced && this.flight) this.finishFlight();
    this.invalidate();
  }

  /** "hero": the landing page (the wheel scrolls the page, the camera drifts); "explore": full controls. */
  setMode(mode: EngineMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.applyMode();
    this.invalidate();
  }

  /** The screen edges the HUD covers, in CSS pixels; the engine frames the space between them. */
  setInsets(insets: Insets): void {
    const i = this.insets;
    if (i.top === insets.top && i.right === insets.right && i.bottom === insets.bottom && i.left === insets.left) return;
    this.insets = { ...insets };
    // Ease the view's center into the new free area while frames are being drawn; otherwise jump.
    const drawing = this.lastDraw > 0 && performance.now() - this.lastDraw < 500;
    if (this.reduced || !this.host || !drawing) {
      this.shown = { ...insets };
      this.applyViewOffset();
    }
    if (this.flight) this.retarget();
    else if (!this.userMoved) this.reframe(true);
    this.invalidate();
  }

  /** Areas where labels must not sit (the hero's copy, open panels), in CSS pixels from the canvas's top left. */
  setBlocked(rects: Rect[]): void {
    this.blocked = rects;
    this.invalidate();
  }

  /** The whole galaxy. */
  showGalaxy(): void {
    this.view = { kind: "galaxy" };
    this.familyFocus = null;
    this.planetPicked = null;
    this.userMoved = false;
    this.idleUntil = 0;
    this.syncSelection();
    this.applyMode();
    this.fly(this.galaxyFraming(this.mode === "hero" ? HERO_ELEVATION : EXPLORE_ELEVATION), 1.6);
  }

  /** Flies to a model's system. Unknown ids are ignored. */
  showSystem(id: string): void {
    const index = this.catalog.systems.findIndex((s) => s.id === id);
    if (index < 0) return;
    const same = this.view.kind === "system" && this.view.index === index;
    this.view = { kind: "system", index };
    if (!same) {
      this.familyFocus = null;
      this.planetPicked = null;
    }
    this.userMoved = false;
    this.syncSelection();
    this.applyMode();
    if (!same) this.fly(this.systemFraming(index), 1.8);
  }

  /** Focuses one arm (the others dim but stay visible), or none. */
  setArm(arm: Modality | null): void {
    this.armFocus = arm;
    const k = arm ? ARM_ORDER.indexOf(arm) : -1;
    this.dustMaterial.uniforms.uArmFocus.value = k;
    this.starMaterial.uniforms.uArmFocus.value = k;
    this.orbitMaterial.uniforms.uArmFocus.value = k;
    this.invalidate();
  }

  /** Highlights one orbit family in the selected system, or none. */
  setFamily(relation: Relation | null): void {
    this.familyFocus = relation;
    const k = relation ? RELATIONS.indexOf(relation) : -1;
    this.orbitMaterial.uniforms.uFamilyFocus.value = k;
    this.planetMaterial.uniforms.uFamilyFocus.value = k;
    this.invalidate();
  }

  /** Highlights the named body with this id in the selected system, or none. */
  pickPlanet(id: string | null): void {
    const system = this.view.kind === "system" ? this.view.index : -1;
    const i = id === null ? -1 : this.named.findIndex((b) => b.system === system && b.model.id === id);
    this.planetPicked = i >= 0 ? i : null;
    this.syncPlanetHighlight();
  }

  /** Zoom buttons (in the hero, where the wheel scrolls the page). */
  zoom(factor: number): void {
    this.flight = null;
    this.userMoved = true;
    this.idleUntil = performance.now() + IDLE_BEFORE_DRIFT_MS;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const d = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(d));
    this.controls.update();
    this.invalidate();
  }

  /** Back to the current view's framing. */
  reset(): void {
    this.userMoved = false;
    this.fly(this.view.kind === "system" ? this.systemFraming(this.view.index) : this.galaxyFraming(this.mode === "hero" ? HERO_ELEVATION : EXPLORE_ELEVATION), 1.2);
  }

  /** Asks for a frame. */
  invalidate = (): void => {
    if (this.disposed || !this.host || !this.active || document.hidden) return;
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    if (this.host) this.detach(this.host);
    this.stopWatch();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointercancel", this.onPointerLeave);
    this.controls.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of [this.sky.texture, this.glow.texture, this.ring.texture]) t.dispose();
    this.labels.dispose();
    this.renderer.dispose();
  }

  /* ---------- Building ---------- */

  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /**
   * Shared uniforms for points sized in world units. `minPx` is in CSS pixels; a point held at that
   * size fades in proportion, down to `fadeFloor`, so far clouds stay faint instead of solid.
   */
  private pointUniforms(minPx: number, fadeFloor: number, maxPx = 48): Record<string, THREE.IUniform> {
    return { uProj: { value: 1 }, uMinPx: { value: minPx * this.pixelRatio }, uMaxPx: { value: maxPx * this.pixelRatio }, uFadeFloor: { value: fadeFloor } };
  }

  private buildFarStars(): THREE.Points {
    const n = 2600;
    const rand = seeded(99);
    const pos = new Float32Array(n * 3);
    const color = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 2600;
      pos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
      const [cr, cg, cb] = blackbodyLinear(3200 + rand() ** 1.6 * 12000);
      const b = 0.25 + 0.75 * rand() ** 3;
      color.set([cr * b, cg * b, cb * b], i * 3);
      size[i] = 0.8 + 2.2 * rand() ** 4;
    }
    const g = this.trackGeo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    const points = new THREE.Points(g, this.bgMaterial);
    points.frustumCulled = false;
    return points;
  }

  private buildDust(): THREE.Points {
    const d = dust(9000, 5200, 5200);
    const g = this.trackGeo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute("aKind", new THREE.BufferAttribute(d.kind, 1));
    g.setAttribute("aBright", new THREE.BufferAttribute(d.brightness, 1));
    const points = new THREE.Points(g, this.dustMaterial);
    points.frustumCulled = false;
    return points;
  }

  private buildYearRings(): THREE.Points {
    const rings = yearRings(this.catalog.fetchedAt);
    const per = 420;
    const pos = new Float32Array((rings.length + 1) * per * 3);
    const radii = [...rings.map((r) => r.r), GALAXY.inner];
    radii.forEach((r, k) => {
      for (let i = 0; i < per; i++) {
        const a = (i / per) * Math.PI * 2;
        pos.set([r * Math.cos(a), 0, r * Math.sin(a)], (k * per + i) * 3);
      }
    });
    const g = this.trackGeo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, this.ringMaterial);
  }

  private buildLineage(): void {
    const index = new Map(this.catalog.systems.map((s, i) => [s.id, i]));
    const points: THREE.Vector3[] = [];
    this.catalog.systems.forEach((s, i) => {
      for (const p of s.parents) {
        const j = index.get(p.id);
        if (j === undefined) continue;
        const a = this.centers[j];
        const b = this.centers[i];
        const mid = a.clone().add(b).multiplyScalar(0.5);
        mid.y += a.distanceTo(b) * 0.22;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const pts = curve.getPoints(48);
        for (let k = 0; k < pts.length - 1; k++) points.push(pts[k], pts[k + 1]);
      }
    });
    if (!points.length) return;
    const g = this.trackGeo(new THREE.BufferGeometry().setFromPoints(points));
    const m = this.track(new THREE.LineBasicMaterial({ color: COLOR.hf.yellow, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(new THREE.LineSegments(g, m));
  }

  private buildOrbits(): THREE.Points {
    const o = buildOrbits(this.catalog, this.stars);
    const g = this.trackGeo(new THREE.BufferGeometry());
    // P doubles as the position attribute three.js needs to size the draw.
    g.setAttribute("position", new THREE.BufferAttribute(o.P, 3));
    g.setAttribute("aQ", new THREE.BufferAttribute(o.Q, 3));
    g.setAttribute("aOrbit", new THREE.BufferAttribute(o.orbit, 4));
    g.setAttribute("aMeta", new THREE.BufferAttribute(o.meta, 4));
    const points = new THREE.Points(g, this.orbitMaterial);
    points.frustumCulled = false;
    return points;
  }

  private buildPlanets(): THREE.Points {
    const n = this.named.length;
    const P = new Float32Array(n * 3);
    const Q = new Float32Array(n * 3);
    const orbit = new Float32Array(n * 4);
    const meta = new Float32Array(n * 4);
    this.named.forEach((b, i) => {
      P.set(b.P, i * 3);
      Q.set(b.Q, i * 3);
      orbit.set([b.orbit.a, b.orbit.e, b.orbit.M0, b.orbit.n], i * 4);
      meta.set([RELATIONS.indexOf(b.relation), b.system, b.size, i], i * 4);
    });
    const g = this.trackGeo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.setAttribute("aQ", new THREE.BufferAttribute(Q, 3));
    g.setAttribute("aOrbit", new THREE.BufferAttribute(orbit, 4));
    g.setAttribute("aMeta", new THREE.BufferAttribute(meta, 4));
    const points = new THREE.Points(g, this.planetMaterial);
    points.frustumCulled = false;
    points.renderOrder = 5;
    return points;
  }

  private buildStars(): THREE.Mesh {
    const n = this.stars.length;
    const quad = this.trackGeo(new THREE.PlaneGeometry(2, 2));
    const g = this.trackGeo(new THREE.InstancedBufferGeometry());
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    const pos = new Float32Array(n * 3);
    const color = new Float32Array(n * 3);
    const core = new Float32Array(n);
    const glow = new Float32Array(n);
    const arm = new Float32Array(n);
    const index = new Float32Array(n);
    this.stars.forEach((s, i) => {
      pos.set(s.pos, i * 3);
      color.set(s.color, i * 3);
      core[i] = s.core;
      glow[i] = s.glow;
      arm[i] = s.arm;
      index[i] = i;
    });
    g.setAttribute("iPos", new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute("iColor", new THREE.InstancedBufferAttribute(color, 3));
    g.setAttribute("iCore", new THREE.InstancedBufferAttribute(core, 1));
    g.setAttribute("iGlow", new THREE.InstancedBufferAttribute(glow, 1));
    g.setAttribute("iArm", new THREE.InstancedBufferAttribute(arm, 1));
    g.setAttribute("iIndex", new THREE.InstancedBufferAttribute(index, 1));
    g.instanceCount = n;
    const mesh = new THREE.Mesh(g, this.starMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    return mesh;
  }

  private labelSpecs(): LabelSpec[] {
    const specs: LabelSpec[] = [];
    specs.push({ key: "core", kind: "core", title: "The Hub", sub: "huggingface.co" });
    ARM_ORDER.forEach((m, k) => specs.push({ key: `arm:${k}`, kind: "arm", title: MODALITY[m].label, swatch: COLOR.arm[m] }));
    for (const r of yearRings(this.catalog.fetchedAt)) specs.push({ key: `year:${r.year}`, kind: "year", title: String(r.year) });
    specs.push({ key: "year:before", kind: "year", title: "Before Mar 2022" });
    this.catalog.systems.forEach((s, i) => {
      const [owner, name] = splitId(s.id);
      specs.push({ key: `star:${i}`, kind: "star", title: name, sub: owner });
    });
    this.named.forEach((b, i) => {
      const [owner, name] = splitId(b.model.id);
      specs.push({ key: `planet:${i}`, kind: "planet", title: name, sub: owner, swatch: COLOR.orbit[b.relation] });
    });
    return specs;
  }

  private repaint(): void {
    paintSky(this.sky.ctx, this.sky.canvas.width, this.sky.canvas.height);
    paintCoreGlow(this.glow.ctx, this.glow.canvas.width);
    paintRing(this.ring.ctx, this.ring.canvas.width);
    for (const t of [this.sky.texture, this.glow.texture, this.ring.texture]) t.needsUpdate = true;
  }

  /* ---------- Views ---------- */

  private applyMode(): void {
    const explore = this.mode === "explore";
    this.controls.enableZoom = explore;
    if (this.view.kind === "system") {
      const s = this.stars[this.view.index];
      this.controls.minDistance = s.scale * 0.9;
      this.controls.maxDistance = 80;
    } else {
      this.controls.minDistance = 6;
      this.controls.maxDistance = 260;
    }
    // In the hero, vertical swipes scroll the page (connect() sets touch-action: none).
    this.canvas.style.touchAction = explore ? "none" : "pan-y";
  }

  private syncSelection(): void {
    const i = this.view.kind === "system" ? this.view.index : -1;
    this.starMaterial.uniforms.uSelected.value = i;
    this.orbitMaterial.uniforms.uSelected.value = i;
    this.planetMaterial.uniforms.uSelected.value = i;
    this.orbitMaterial.uniforms.uFamilyFocus.value = this.familyFocus ? RELATIONS.indexOf(this.familyFocus) : -1;
    this.planetMaterial.uniforms.uFamilyFocus.value = this.orbitMaterial.uniforms.uFamilyFocus.value;
    // Up close, a star's halo would cover its own orbits: keep it tight.
    this.starMaterial.uniforms.uHaloScale.value = i >= 0 ? 0.22 : 1;
    this.dustMaterial.uniforms.uDim.value = i >= 0 ? 0.55 : 1;
    this.invalidate();
  }

  /**
   * The camera distance at which `points` (seen from polar angle `phi`, azimuth `theta`, looking
   * at `target`) fill `fill` of the free part of the screen: projected with the real camera
   * (aspect, view offset) and refined, since a tilted disc's near edge looms larger.
   */
  private fitDistance(target: THREE.Vector3, phi: number, theta: number, points: readonly THREE.Vector3[], fill: number): number {
    const { w, h } = this.size;
    const l = this.insets.left;
    const r = w - this.insets.right;
    const t = this.insets.top;
    const b = h - this.insets.bottom;
    const cx = (l + r) / 2;
    const cy = (t + b) / 2;
    const halfW = Math.max(40, ((r - l) / 2) * fill);
    const halfH = Math.max(40, ((b - t) / 2) * fill);
    const cam = this.fitCamera.copy(this.camera);
    let radius = 0;
    for (const p of points) radius = Math.max(radius, p.distanceTo(target));
    let d = (radius / Math.tan(THREE.MathUtils.degToRad(FOV) / 2)) * 1.2;
    for (let k = 0; k < 6; k++) {
      cam.position.setFromSpherical(new THREE.Spherical(d, phi, theta)).add(target);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let worst = 0;
      for (const p of points) {
        const s = this.tmp2.copy(p).project(cam);
        if (s.z >= 1) {
          worst = Math.max(worst, 2);
          continue;
        }
        const x = ((s.x + 1) / 2) * w;
        const y = ((1 - s.y) / 2) * h;
        worst = Math.max(worst, Math.abs(x - cx) / halfW, Math.abs(y - cy) / halfH);
      }
      if (Math.abs(worst - 1) < 0.01) break;
      d *= worst;
    }
    return d;
  }

  /** The distance that frames the current view from (phi, theta). */
  private viewDistance(target: THREE.Vector3, phi: number, theta: number): number {
    if (this.view.kind === "galaxy") return this.fitDistance(target, phi, theta, this.galaxyOutline, this.mode === "hero" ? 1.04 : 0.98);
    const s = this.stars[this.view.index];
    const reach = s.scale * 1.15;
    const points = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * reach, (k % 2 ? 0.35 : -0.35) * reach, Math.sin(a) * reach).add(target));
    }
    return Math.max(this.fitDistance(target, phi, theta, points, 0.86), s.scale * 1.8);
  }

  private galaxyFraming(polarFromDisc: number, azimuth = this.azimuth()): { target: THREE.Vector3; sph: THREE.Spherical } {
    const target = new THREE.Vector3(0, 0, 0);
    const phi = Math.PI / 2 - polarFromDisc;
    return { target, sph: new THREE.Spherical(this.viewDistance(target, phi, azimuth), phi, azimuth) };
  }

  /** Looks at a system about 50° from its own orbital plane's normal, from the camera's side. */
  private systemFraming(index: number): { target: THREE.Vector3; sph: THREE.Spherical } {
    const s = this.stars[index];
    const target = this.centers[index].clone();
    const normal = new THREE.Vector3(...rotate([0, 1, 0], s.tiltAxis, s.tilt)).normalize();
    const side = this.tmp.copy(this.camera.position).sub(target);
    side.addScaledVector(normal, -side.dot(normal));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0).addScaledVector(normal, -normal.x);
    side.normalize();
    const tilt = THREE.MathUtils.degToRad(50);
    const dir = normal.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt));
    const look = new THREE.Spherical().setFromVector3(dir);
    const phi = THREE.MathUtils.clamp(look.phi, 0.15, Math.PI * 0.55);
    return { target, sph: new THREE.Spherical(this.viewDistance(target, phi, look.theta), phi, look.theta) };
  }

  private reframe(instant: boolean): void {
    const f = this.view.kind === "system" ? this.systemFraming(this.view.index) : this.galaxyFraming(this.mode === "hero" ? HERO_ELEVATION : EXPLORE_ELEVATION);
    if (instant) this.frame(f, true);
    else this.fly(f, 1.2);
  }

  private azimuth(): number {
    return new THREE.Spherical().setFromVector3(this.tmp.copy(this.camera.position).sub(this.controls.target)).theta;
  }

  private frame(f: { target: THREE.Vector3; sph: THREE.Spherical }, updateControls: boolean): void {
    this.controls.target.copy(f.target);
    this.camera.position.setFromSpherical(f.sph).add(f.target);
    this.camera.lookAt(f.target);
    if (updateControls) this.controls.update();
  }

  private fly(f: { target: THREE.Vector3; sph: THREE.Spherical }, seconds: number): void {
    if (this.reduced || !this.host) {
      this.flight = null;
      this.frame(f, true);
      this.invalidate();
      return;
    }
    const from = new THREE.Spherical().setFromVector3(this.tmp.copy(this.camera.position).sub(this.controls.target));
    // Turn the short way round.
    let theta = f.sph.theta;
    while (theta - from.theta > Math.PI) theta -= Math.PI * 2;
    while (theta - from.theta < -Math.PI) theta += Math.PI * 2;
    const to = new THREE.Spherical(f.sph.radius, f.sph.phi, theta);
    const travel = this.controls.target.distanceTo(f.target);
    this.flight = {
      fromTarget: this.controls.target.clone(),
      toTarget: f.target.clone(),
      from,
      to,
      start: performance.now(),
      duration: seconds * 1000,
      arc: Math.min(1.2, travel / Math.max(from.radius, to.radius, 1)) * 0.6,
    };
    this.invalidate();
  }

  private stepFlight(now: number): void {
    const f = this.flight;
    if (!f) return;
    const t = Math.min(1, (now - f.start) / f.duration);
    const e = easeInOut(t);
    const target = this.tmp.copy(f.fromTarget).lerp(f.toTarget, e);
    const radius = Math.exp(THREE.MathUtils.lerp(Math.log(f.from.radius), Math.log(f.to.radius), e)) * (1 + f.arc * Math.sin(Math.PI * e));
    const sph = new THREE.Spherical(radius, THREE.MathUtils.lerp(f.from.phi, f.to.phi, e), THREE.MathUtils.lerp(f.from.theta, f.to.theta, e));
    this.controls.target.copy(target);
    this.camera.position.setFromSpherical(sph).add(target);
    this.camera.lookAt(target);
    if (t >= 1) this.finishFlight();
  }

  /** The screen's free area changed during a flight: land at the distance that frames the new one. */
  private retarget(): void {
    const f = this.flight;
    if (!f) return;
    f.to.radius = this.viewDistance(f.toTarget, f.to.phi, f.to.theta);
  }

  private finishFlight(): void {
    const f = this.flight;
    this.flight = null;
    if (!f) return;
    this.frame({ target: f.toTarget, sph: f.to }, true);
  }

  private applyViewOffset(): void {
    const { w, h } = this.size;
    const cx = (this.shown.left + (w - this.shown.right)) / 2;
    const cy = (this.shown.top + (h - this.shown.bottom)) / 2;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix();
  }

  /** Moves the shown insets toward the goal (about a third of a second); true while still moving. */
  private easeInsets(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 12);
    let moving = false;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const d = this.insets[side] - this.shown[side];
      if (Math.abs(d) < 0.5) this.shown[side] = this.insets[side];
      else {
        this.shown[side] += d * k;
        moving = true;
      }
    }
    this.applyViewOffset();
    return moving;
  }

  private insetsMoving(): boolean {
    const a = this.insets;
    const b = this.shown;
    return a.top !== b.top || a.right !== b.right || a.bottom !== b.bottom || a.left !== b.left;
  }

  private resize(): void {
    if (!this.host) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    if (w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.camera.aspect = w / h;
    this.applyViewOffset();
    const pxPerUnit = h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    this.starMaterial.uniforms.uPxPerUnit.value = pxPerUnit;
    for (const m of [this.dustMaterial, this.orbitMaterial, this.planetMaterial]) m.uniforms.uProj.value = pxPerUnit * this.pixelRatio;
    if (this.flight) this.retarget();
    else if (!this.userMoved) this.reframe(true);
    this.invalidate();
  }

  /* ---------- The loop ---------- */

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.running = false;
  }

  private animating(): boolean {
    return !this.reduced;
  }

  private loop = (now: number): void => {
    this.raf = 0;
    if (this.disposed || !this.host || !this.active || document.hidden) {
      this.running = false;
      return;
    }
    const busy = this.interacting || this.flight !== null || this.insetsMoving();
    if (!busy && this.animating() && now - this.lastDraw < 1000 / AMBIENT_FPS - 2) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.lastDraw = now;
    if (this.animating()) this.time += dt;
    const easing = this.insetsMoving() && this.easeInsets(dt);
    if (this.flight) this.stepFlight(now);
    else this.drift(dt, now);
    const damping = this.controls.update();
    this.draw();
    if (this.animating() || this.flight || damping || this.interacting || easing) this.raf = requestAnimationFrame(this.loop);
    else this.running = false;
  };

  /** The hero's slow turn, after the visitor has been still for a while. */
  private drift(dt: number, now: number): void {
    if (this.reduced || this.mode !== "hero" || this.interacting || now < this.idleUntil) return;
    const off = this.tmp.copy(this.camera.position).sub(this.controls.target);
    off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, DRIFT * dt);
    this.camera.position.copy(this.controls.target).add(off);
    this.camera.lookAt(this.controls.target);
  }

  private draw(): void {
    this.orbitMaterial.uniforms.uTime.value = this.time;
    this.planetMaterial.uniforms.uTime.value = this.time;
    this.updateRings();
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels();
  }

  /* ---------- Rings, labels, picking ---------- */

  private starScreenRadius(i: number): { x: number; y: number; r: number; visible: boolean } {
    const s = this.stars[i];
    const p = this.tmp.copy(this.centers[i]).project(this.camera);
    const depth = this.tmp2.copy(this.centers[i]).applyMatrix4(this.camera.matrixWorldInverse).z;
    const pxPerUnit = this.size.h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    const unit = -depth / pxPerUnit;
    const halo = Math.max(s.core * (5 + 12 * s.glow) * this.starMaterial.uniforms.uHaloScale.value, (9 + 26 * s.glow) * unit);
    return { x: ((p.x + 1) / 2) * this.size.w, y: ((1 - p.y) / 2) * this.size.h, r: (halo / unit) * 0.5, visible: p.z < 1 && depth < 0 };
  }

  private updateRings(): void {
    const sel = this.view.kind === "system" ? this.view.index : -1;
    this.selectRing.visible = sel >= 0;
    if (sel >= 0) this.placeRing(this.selectRing, sel, 1);
    const hov = this.hover?.kind === "star" && this.hover.index !== sel ? this.hover.index : -1;
    this.hoverRing.visible = hov >= 0;
    if (hov >= 0) this.placeRing(this.hoverRing, hov, 1);
  }

  private placeRing(ring: THREE.Sprite, i: number, k: number): void {
    ring.position.copy(this.centers[i]);
    const depth = -this.tmp.copy(this.centers[i]).applyMatrix4(this.camera.matrixWorldInverse).z;
    const pxPerUnit = this.size.h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    const s = this.stars[i];
    // About 34 pixels across at any distance, a little more for a bigger star.
    ring.scale.setScalar(Math.max(((34 + 30 * s.glow) * k * depth) / pxPerUnit, s.core * 3.2));
  }

  private layoutLabels(): void {
    if (!this.host) return;
    const { w, h } = this.size;
    const list: Placement[] = [];
    const project = (v: THREE.Vector3) => {
      const p = this.tmp2.copy(v).project(this.camera);
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, ok: p.z < 1 && p.z > -1 };
    };
    const system = this.view.kind === "system" ? this.view.index : -1;
    const hero = this.mode === "hero";
    const armK = this.armFocus ? ARM_ORDER.indexOf(this.armFocus) : -1;
    // Stars.
    const ranked = this.catalog.systems.map((s, i) => ({ i, d: s.downloads })).sort((a, b) => b.d - a.d);
    const heroShown = new Set(ranked.slice(0, 10).map((x) => x.i));
    for (let i = 0; i < this.stars.length; i++) {
      const sp = this.starScreenRadius(i);
      if (!sp.visible) continue;
      const selected = i === system;
      const hovered = this.hover?.kind === "star" && this.hover.index === i;
      let opacity = 1;
      if (system >= 0 && !selected && !hovered) opacity = 0;
      else if (hero && !heroShown.has(i) && !hovered && !selected) opacity = 0;
      else if (armK >= 0 && this.stars[i].arm !== armK && !hovered && !selected) opacity = 0.45;
      list.push({ key: `star:${i}`, x: sp.x, y: sp.y, lift: Math.min(sp.r * 0.55, 30) + 6, priority: selected ? 1000 : hovered ? 900 : 100 + 100 * this.stars[i].glow, opacity });
    }
    // The core, the arms and the years (the galaxy only).
    if (system < 0) {
      const c = project(this.tmp.set(0, 0, 0));
      // Below the core, so the bulge's stars keep the space above it for their names.
      if (c.ok) list.push({ key: "core", x: c.x, y: c.y + 48, lift: 0, priority: 600, opacity: 0.95 });
      ARM_ORDER.forEach((_, k) => {
        const r = GALAXY.outer + 1.5;
        const a = armAngle(k, r);
        const p = project(this.tmp.set(r * Math.cos(a), 0, r * Math.sin(a)));
        if (p.ok) list.push({ key: `arm:${k}`, x: p.x, y: p.y, lift: 0, priority: 700, opacity: armK < 0 || armK === k ? 1 : 0.5 });
      });
      if (!hero) {
        for (const r of yearRings(this.catalog.fetchedAt)) {
          const p = project(this.tmp.set(0, 0, r.r));
          if (p.ok) list.push({ key: `year:${r.year}`, x: p.x, y: p.y, lift: 0, priority: 40, opacity: 0.85 });
        }
        const p = project(this.tmp.set(0, 0, GALAXY.inner));
        if (p.ok) list.push({ key: "year:before", x: p.x, y: p.y + 14, lift: 0, priority: 35, opacity: 0.75 });
      }
    } else {
      // The selected system's named members: the most downloaded of each family, and the hovered one.
      const center = this.centers[system];
      const firstOf = new Set<number>();
      const seen = new Set<Relation>();
      this.named.forEach((b, i) => {
        if (b.system !== system || seen.has(b.relation)) return;
        seen.add(b.relation);
        firstOf.add(i);
      });
      this.named.forEach((b, i) => {
        if (b.system !== system) return;
        const hovered = this.hover?.kind === "planet" && this.hover.index === i;
        const picked = this.planetPicked === i;
        const focused = !this.familyFocus || this.familyFocus === b.relation;
        if (!hovered && !picked && !(firstOf.has(i) && focused) && !(this.familyFocus === b.relation)) return;
        const pos = bodyPosition(b, this.time, [center.x, center.y, center.z]);
        const p = project(this.tmp.set(...pos));
        if (!p.ok) return;
        list.push({ key: `planet:${i}`, x: p.x, y: p.y, lift: 10, priority: hovered || picked ? 950 : 300 + b.model.downloads / 1e9, opacity: 1 });
      });
    }
    this.labels.place(list, { l: 4, t: 4, r: w - 4, b: h - 4 }, this.blocked);
  }

  private pick(x: number, y: number): { kind: "star"; index: number } | { kind: "planet"; index: number } | null {
    const system = this.view.kind === "system" ? this.view.index : -1;
    if (system >= 0) {
      const center = this.centers[system];
      let best = -1;
      let bestD = 18;
      this.named.forEach((b, i) => {
        if (b.system !== system) return;
        const pos = bodyPosition(b, this.time, [center.x, center.y, center.z]);
        const p = this.tmp.set(...pos).project(this.camera);
        if (p.z >= 1) return;
        const d = Math.hypot(((p.x + 1) / 2) * this.size.w - x, ((1 - p.y) / 2) * this.size.h - y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) return { kind: "planet", index: best };
    }
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.stars.length; i++) {
      const sp = this.starScreenRadius(i);
      if (!sp.visible) continue;
      const d = Math.hypot(sp.x - x, sp.y - y);
      const reach = Math.max(16, Math.min(sp.r * 0.5, 44));
      if (d <= reach && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best >= 0 ? { kind: "star", index: best } : null;
  }

  private setHover(h: UniverseEngine["hover"]): void {
    const same = (h === null && this.hover === null) || (h && this.hover && h.kind === this.hover.kind && h.index === this.hover.index);
    if (same) return;
    this.hover = h;
    this.starMaterial.uniforms.uHover.value = h?.kind === "star" ? h.index : -1;
    this.canvas.style.cursor = h ? "pointer" : "";
    this.syncPlanetHighlight();
  }

  /** The picked body keeps its ring; otherwise the hovered one gets it. */
  private syncPlanetHighlight(): void {
    this.planetMaterial.uniforms.uHover.value = this.planetPicked ?? (this.hover?.kind === "planet" ? this.hover.index : -1);
    this.invalidate();
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    const p = this.local(e);
    this.down = { ...p, t: performance.now() };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const d = this.down;
    this.down = null;
    if (!d) return;
    const p = this.local(e);
    if (Math.hypot(p.x - d.x, p.y - d.y) > 6 || performance.now() - d.t > 600) return;
    const hit = this.pick(p.x, p.y);
    if (hit?.kind === "star") this.hooks.onSelect(this.catalog.systems[hit.index].id);
    else if (hit?.kind === "planet") {
      this.planetPicked = hit.index;
      this.syncPlanetHighlight();
      this.hooks.onPlanet?.(this.named[hit.index].model.id);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === "touch" || this.down) return;
    const p = this.local(e);
    this.setHover(this.pick(p.x, p.y));
  };

  private onPointerLeave = (): void => {
    this.down = null;
    this.setHover(null);
  };

  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else this.invalidate();
  };

}
