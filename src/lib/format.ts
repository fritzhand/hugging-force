/* Numbers and dates as the page writes them (American English). */
import { isLegacy } from "./galaxy.ts";

const UNITS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
];

/** Three significant figures and a unit: 4,864,172 -> "4.86 M"; 999 -> "999". */
export function compact(n: number): string {
  for (const [size, unit] of UNITS) {
    if (Math.abs(n) >= size * 0.9995) {
      const v = n / size;
      const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
      return `${v.toFixed(digits)} ${unit}`;
    }
  }
  return String(Math.round(n));
}

/** Every digit: 4864172 -> "4,864,172". */
export function exact(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** A parameter count, or what the Hub says about it. */
export function parameters(n: number | null): string {
  return n === null ? "Not reported" : compact(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jul 18, 2024", from an ISO date (UTC). */
export function day(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Jul 2024". */
export function month(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** When a model arrived on the Hub, or "Before Mar 2022" for repositories older than the Hub's dates. */
export function hubDate(iso: string): string {
  return isLegacy(iso) ? "Before Mar 2022" : day(iso);
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "11,500 K", rounded to the nearest 100 K. */
export function kelvin(k: number): string {
  return `${exact(Math.round(k / 100) * 100)} K`;
}

/** A magnitude with its sign: "-1.7", "+2.4". */
export function signed(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}`;
}

/** A Hub id's owner and name: "meta-llama/Llama-3.1-8B" -> ["meta-llama", "Llama-3.1-8B"]. */
export function splitId(id: string): [string, string] {
  const i = id.indexOf("/");
  return i < 0 ? ["", id] : [id.slice(0, i), id.slice(i + 1)];
}

/** The model's page on the Hub. */
export function hubUrl(id: string): string {
  return `https://huggingface.co/${id.split("/").map(encodeURIComponent).join("/")}`;
}
