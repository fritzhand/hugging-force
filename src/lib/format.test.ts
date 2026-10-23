import { describe, expect, it } from "vitest";
import { compact, day, exact, hubDate, hubUrl, kelvin, parameters, signed, splitId } from "./format.ts";

describe("format", () => {
  it("writes compact numbers with three significant figures", () => {
    expect(compact(4864172)).toBe("4.86 M");
    expect(compact(193424443)).toBe("193 M");
    expect(compact(17017)).toBe("17.0 k");
    expect(compact(999)).toBe("999");
    expect(compact(8030261248)).toBe("8.03 B");
    expect(compact(684489845504)).toBe("684 B");
    expect(compact(999999)).toBe("1.00 M");
  });

  it("writes exact numbers, parameters and temperatures", () => {
    expect(exact(4864172)).toBe("4,864,172");
    expect(parameters(null)).toBe("Not reported");
    expect(parameters(22713728)).toBe("22.7 M");
    expect(kelvin(11523)).toBe("11,500 K");
    expect(signed(-1.74)).toBe("−1.7");
    expect(signed(2.36)).toBe("+2.4");
  });

  it("writes Hub dates, and says when the Hub does not know", () => {
    expect(day("2024-07-18T08:56:00.000Z")).toBe("Jul 18, 2024");
    expect(hubDate("2022-03-02T23:29:04.000Z")).toBe("Before Mar 2022");
    expect(hubDate("2025-01-20T00:00:00.000Z")).toBe("Jan 20, 2025");
  });

  it("splits ids and links to the Hub", () => {
    expect(splitId("meta-llama/Llama-3.1-8B-Instruct")).toEqual(["meta-llama", "Llama-3.1-8B-Instruct"]);
    expect(hubUrl("meta-llama/Llama-3.1-8B-Instruct")).toBe("https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct");
  });
});
