/* Finds models by id, owner, task or modality. Every word of the query must match somewhere;
   a match in the model's name ranks first, then its owner, then its task. */
import type { ModelSystem } from "../data/types.ts";
import { MODALITY } from "./modality.ts";

export interface Hit {
  system: ModelSystem;
  score: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function search(systems: readonly ModelSystem[], query: string, limit = 8): Hit[] {
  const words = norm(query).split(/[\s/]+/).filter(Boolean);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const s of systems) {
    const [owner, name] = [norm(s.author), norm(s.id.slice(s.author.length + 1))];
    const task = norm(`${s.task} ${s.taskName}`);
    const modality = norm(`${MODALITY[s.modality].label} ${MODALITY[s.modality].hub}`);
    let score = 0;
    let all = true;
    for (const w of words) {
      if (name.startsWith(w)) score += 6;
      else if (name.includes(w)) score += 4;
      else if (owner.startsWith(w)) score += 3;
      else if (owner.includes(w)) score += 2;
      else if (task.includes(w)) score += 1.5;
      else if (modality.includes(w)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (all) hits.push({ system: s, score });
  }
  return hits.sort((a, b) => b.score - a.score || b.system.downloads - a.system.downloads).slice(0, limit);
}
