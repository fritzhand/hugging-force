import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchContext, type VisibilitySource } from "./contextWatch.ts";

class Doc extends EventTarget implements VisibilitySource {
  visibilityState: DocumentVisibilityState = "visible";
}

const lost = () => {
  const e = new Event("webglcontextlost", { cancelable: true });
  return e;
};

describe("watchContext", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("repaints when the context comes back", () => {
    const canvas = new EventTarget();
    const hooks = { restored: vi.fn(), giveUp: vi.fn() };
    watchContext(canvas, hooks, 1000, new Doc());
    const e = lost();
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    vi.advanceTimersByTime(5000);
    expect(hooks.restored).toHaveBeenCalledOnce();
    expect(hooks.giveUp).not.toHaveBeenCalled();
  });

  it("gives up after the wait, counting only visible time", () => {
    const canvas = new EventTarget();
    const doc = new Doc();
    const hooks = { restored: vi.fn(), giveUp: vi.fn() };
    watchContext(canvas, hooks, 1000, doc);
    doc.visibilityState = "hidden";
    canvas.dispatchEvent(lost());
    vi.advanceTimersByTime(5000);
    expect(hooks.giveUp).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(999);
    expect(hooks.giveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(hooks.giveUp).toHaveBeenCalledOnce();
  });

  it("stops watching", () => {
    const canvas = new EventTarget();
    const hooks = { restored: vi.fn(), giveUp: vi.fn() };
    const stop = watchContext(canvas, hooks, 1000, new Doc());
    stop();
    canvas.dispatchEvent(lost());
    vi.advanceTimersByTime(5000);
    expect(hooks.giveUp).not.toHaveBeenCalled();
  });
});
