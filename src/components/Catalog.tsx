/* The catalog: every star as a card, filterable by arm and sortable. Also the universe without 3D:
   every model is reachable here. */
import { useMemo, useState } from "react";
import { derivatives } from "../data/catalog.ts";
import { MODALITIES, type Modality, type ModelSystem } from "../data/types.ts";
import { MODALITY } from "../lib/modality.ts";
import { routeHref } from "../hooks/useRoute.ts";
import { ArmIcon } from "./Icons.tsx";
import { ModelCard } from "./ModelCard.tsx";

const SORTS = {
  downloads: { label: "Most downloaded", key: (s: ModelSystem) => s.downloads },
  trending: { label: "Trending", key: (s: ModelSystem) => s.trendingScore },
  tree: { label: "Most built on", key: (s: ModelSystem) => derivatives(s) },
  newest: { label: "Newest", key: (s: ModelSystem) => Date.parse(s.createdAt) },
} as const;

type Sort = keyof typeof SORTS;

export function Catalog({ systems, onOpen }: { systems: readonly ModelSystem[]; onOpen(id: string): void }) {
  const [arm, setArm] = useState<Modality | null>(null);
  const [sort, setSort] = useState<Sort>("downloads");
  const shown = useMemo(() => {
    const key = SORTS[sort].key;
    return systems.filter((s) => !arm || s.modality === arm).sort((a, b) => key(b) - key(a) || a.id.localeCompare(b.id));
  }, [systems, arm, sort]);
  return (
    <div className="catalog">
      <div className="catalog-controls">
        <div className="chips" role="group" aria-label="Filter by modality">
          <button type="button" className={`chip ${arm === null ? "is-on" : ""}`} aria-pressed={arm === null} onClick={() => setArm(null)}>
            All <span className="chip-count">{systems.length}</span>
          </button>
          {MODALITIES.map((m) => (
            <button key={m} type="button" className={`chip ${arm === m ? "is-on" : ""}`} aria-pressed={arm === m} onClick={() => setArm(arm === m ? null : m)}>
              <span className="swatch" style={{ background: `var(--color-arm-${m})` }} />
              <ArmIcon arm={m} size={14} />
              {MODALITY[m].label}
              <span className="chip-count">{systems.filter((s) => s.modality === m).length}</span>
            </button>
          ))}
        </div>
        <label className="sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="card-grid">
        {shown.map((s) => (
          <ModelCard key={s.id} system={s} href={routeHref({ universe: true, model: s.id, arm: null })} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
