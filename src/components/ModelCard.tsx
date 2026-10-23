/* A model as a card: the catalog's view of a star (the landing page's list, and the universe's
   list when nothing is selected). */
import { ArrowUpRight } from "lucide-react";
import { derivatives } from "../data/catalog.ts";
import type { ModelSystem } from "../data/types.ts";
import { compact, hubUrl, month, parameters, splitId } from "../lib/format.ts";
import { isLegacy } from "../lib/galaxy.ts";
import { MODALITY } from "../lib/modality.ts";
import { ArmIcon } from "./Icons.tsx";
import { StarGlyph } from "./StarGlyph.tsx";

interface Props {
  system: ModelSystem;
  href: string;
  onOpen(id: string): void;
}

export function ModelCard({ system: s, href, onOpen }: Props) {
  const [owner, name] = splitId(s.id);
  return (
    <article className="model-card">
      <div className="card-top">
        <span className="arm-chip">
          <span className="swatch" style={{ background: `var(--color-arm-${s.modality})` }} />
          <ArmIcon arm={s.modality} size={14} />
          {MODALITY[s.modality].label}
        </span>
        <span className="task-name">{s.taskName}</span>
      </div>
      <div className="card-title">
        <StarGlyph system={s} size={46} />
        <h3 className="model-id">
          <span className="model-owner">{owner}/</span>
          <span className="model-name">{name}</span>
        </h3>
      </div>
      <dl className="card-stats">
        <div>
          <dt>Downloads · 30 d</dt>
          <dd>{compact(s.downloads)}</dd>
        </div>
        <div>
          <dt>Parameters</dt>
          <dd className={s.parameters === null ? "unknown" : ""}>{parameters(s.parameters)}</dd>
        </div>
        <div>
          <dt>In orbit</dt>
          <dd>{compact(derivatives(s))}</dd>
        </div>
        <div>
          <dt>Since</dt>
          <dd>{isLegacy(s.createdAt) ? "< Mar 2022" : month(s.createdAt)}</dd>
        </div>
      </dl>
      <div className="card-actions">
        <a
          className="text-btn"
          href={href}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onOpen(s.id);
          }}
        >
          Fly to its system
        </a>
        <a className="text-btn muted" href={hubUrl(s.id)} target="_blank" rel="noreferrer">
          Hugging Face <ArrowUpRight size={14} />
        </a>
      </div>
    </article>
  );
}
