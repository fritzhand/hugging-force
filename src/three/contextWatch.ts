/* What the universe does when its WebGL context is lost.

   three.js asks the browser to restore a lost context and re-uploads textures when it returns;
   the engine repaints its canvases and draws a frame (`restored`). A browser may never restore
   it: if no restore arrives within `waitMs` of visible time, `giveUp` asks for a new engine.
   Time spent hidden does not count, since a browser may hold a restore until the tab is shown. */
export interface ContextWatchHooks {
  restored(): void;
  giveUp(): void;
}

/** The parts of `document` the watch reads (a stand-in in tests). */
export interface VisibilitySource extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export const RESTORE_WAIT_MS = 3000;

export function watchContext(canvas: EventTarget, hooks: ContextWatchHooks, waitMs = RESTORE_WAIT_MS, doc: VisibilitySource = document): () => void {
  let lost = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const arm = () => {
    disarm();
    if (!lost || doc.visibilityState !== "visible") return;
    timer = setTimeout(() => {
      timer = undefined;
      if (lost) hooks.giveUp();
    }, waitMs);
  };
  const onLost = (e: Event) => {
    // Without preventDefault the browser never tries to restore the context.
    e.preventDefault();
    lost = true;
    arm();
  };
  const onRestored = () => {
    lost = false;
    disarm();
    hooks.restored();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  doc.addEventListener("visibilitychange", arm);
  return () => {
    disarm();
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    doc.removeEventListener("visibilitychange", arm);
  };
}
