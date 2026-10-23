import { describe, expect, it } from "vitest";
import catalog from "./catalog.json";
import { validateCatalog } from "./validate.ts";

const clone = () => JSON.parse(JSON.stringify(catalog));

describe("the catalog", () => {
  it("passes validation", () => {
    expect(validateCatalog(catalog)).toEqual([]);
  });

  it("rejects unexpected keys, bad ids and impossible numbers", () => {
    const c = clone();
    c.systems[0].secret = "x";
    c.systems[1].id = "not an id";
    c.systems[2].downloads = -1;
    c.systems[3].tree.finetune.top = Array.from({ length: 6 }, (_, i) => ({ id: `someone/model-${i}`, downloads: 1, likes: 0, createdAt: null }));
    c.systems[3].tree.finetune.count = Math.max(6, c.systems[3].tree.finetune.count);
    const problems = validateCatalog(c);
    expect(problems.some((p) => p.includes('unexpected key "secret"'))).toBe(true);
    expect(problems.some((p) => p.includes("bad id"))).toBe(true);
    expect(problems.some((p) => p.includes("downloads must be a count"))).toBe(true);
    expect(problems.some((p) => p.includes("more than five named members"))).toBe(true);
  });

  it("rejects a modality without an arm and duplicate ids", () => {
    const c = clone();
    c.systems[0].modality = "tabular";
    c.systems[2].id = c.systems[1].id;
    c.systems[2].author = c.systems[1].author;
    const problems = validateCatalog(c);
    expect(problems.some((p) => p.includes("has no arm"))).toBe(true);
    expect(problems.some((p) => p.includes("listed twice"))).toBe(true);
  });
});
