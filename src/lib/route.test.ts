import { describe, expect, it } from "vitest";
import { HOME, parseRoute, routeSearch, sameRoute } from "./route.ts";

describe("route", () => {
  it("reads the landing page and the universe", () => {
    expect(parseRoute("")).toEqual(HOME);
    expect(parseRoute("?universe")).toEqual({ universe: true, model: null, arm: null });
  });

  it("reads a model and an arm, and ignores what is not one", () => {
    expect(parseRoute("?universe&model=openai/whisper-large-v3&arm=audio")).toEqual({ universe: true, model: "openai/whisper-large-v3", arm: "audio" });
    expect(parseRoute("?model=not a model&arm=space")).toEqual(HOME);
    expect(parseRoute("?model=../../etc")).toEqual(HOME);
  });

  it("round-trips", () => {
    const r = { universe: true, model: "Qwen/Qwen2.5-VL-7B-Instruct", arm: "multimodal" as const };
    expect(routeSearch(r)).toBe("?universe&model=Qwen/Qwen2.5-VL-7B-Instruct&arm=multimodal");
    expect(sameRoute(parseRoute(routeSearch(r)), r)).toBe(true);
    expect(routeSearch(HOME)).toBe("");
  });
});
