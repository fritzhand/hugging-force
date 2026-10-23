import { describe, expect, it } from "vitest";
import catalog from "../data/catalog.json";
import type { Catalog } from "../data/types.ts";
import { search } from "./search.ts";

const systems = (catalog as Catalog).systems;

describe("search", () => {
  it("finds a model by name, owner or task", () => {
    expect(search(systems, "whisper")[0].system.id).toMatch(/whisper/);
    expect(search(systems, "openai").every((h) => h.system.author === "openai" || h.system.id.toLowerCase().includes("openai"))).toBe(true);
    expect(search(systems, "speech").length).toBeGreaterThan(0);
  });

  it("needs every word to match", () => {
    expect(search(systems, "whisper turbo").map((h) => h.system.id)).toEqual(["openai/whisper-large-v3-turbo"]);
    expect(search(systems, "whisper zebra")).toEqual([]);
    expect(search(systems, "   ")).toEqual([]);
  });

  it("finds an arm by its name", () => {
    expect(search(systems, "multimodal", 50).every((h) => h.system.modality === "multimodal")).toBe(true);
  });
});
