/* A model's system, in words and numbers: what the star shows, from the catalog. */
import { ArrowLeft, ArrowUpRight, ChevronDown, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { derivatives, systemById } from "../data/catalog.ts";
import { RELATIONS, type ModelSystem, type Relation } from "../data/types.ts";
import { compact, day, exact, hubDate, hubUrl, kelvin, parameters, plural, signed, splitId } from "../lib/format.ts";
import { FAMILY, MODALITY } from "../lib/modality.ts";
import { magnitude, spectralClass, temperature } from "../lib/scales.ts";
import { ArmIcon, FamilyGlyph } from "./Icons.tsx";
import { StarGlyph } from "./StarGlyph.tsx";

interface Props {
  system: ModelSystem;
  fetchedAt: string;
  family: Relation | null;
  planet: string | null;
  onFamily(r: Relation | null): void;
  onPlanet(id: string | null): void;
  onSelect(id: string): void;
  onBack(): void;
}

function ModelId({ id, as: Tag = "span" }: { id: string; as?: "span" | "h2" }) {
  const [owner, name] = splitId(id);
  return (
    <Tag className="model-id">
      <span className="model-owner">{owner}/</span>
      <span className="model-name">{name}</span>
    </Tag>
  );
}

export function ModelPanel({ system: s, fetchedAt, family, planet, onFamily, onPlanet, onSelect, onBack }: Props) {
  const [open, setOpen] = useState<Relation | null>(null);
  // A body picked in the universe opens its family's list.
  useEffect(() => {
    const r = planet ? RELATIONS.find((rel) => s.tree[rel].top.some((m) => m.id === planet)) : undefined;
    if (r) setOpen(r);
  }, [planet, s]);
  const k = temperature(s.trendingScore);
  const total = derivatives(s);
  const max = Math.max(1, ...RELATIONS.map((r) => s.tree[r].count));
  const toggle = (r: Relation) => {
    const next = open === r ? null : r;
    setOpen(next);
    onFamily(next);
  };
  return (
    <div className="panel-body">
      <button type="button" className="text-btn back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> All models
      </button>
      <header className="model-head">
        <StarGlyph system={s} size={56} />
        <div>
          <ModelId id={s.id} as="h2" />
          <p className="model-task">
            <span className="arm-chip">
              <span className="swatch" style={{ background: `var(--color-arm-${s.modality})` }} />
              <ArmIcon arm={s.modality} size={14} />
              {MODALITY[s.modality].label}
            </span>
            <span className="task-name">{s.taskName}</span>
          </p>
        </div>
      </header>

      <a className="btn btn-primary btn-block" href={hubUrl(s.id)} target="_blank" rel="noreferrer">
        Open on Hugging Face <ArrowUpRight size={17} />
      </a>

      <dl className="readouts">
        <div>
          <dt>Downloads · 30 days</dt>
          <dd title={exact(s.downloads)}>{compact(s.downloads)}</dd>
        </div>
        <div>
          <dt>Likes</dt>
          <dd title={exact(s.likes)}>{compact(s.likes)}</dd>
        </div>
        <div>
          <dt>Parameters</dt>
          <dd className={s.parameters === null ? "unknown" : ""}>{parameters(s.parameters)}</dd>
        </div>
        <div>
          <dt>On the Hub since</dt>
          <dd>{hubDate(s.createdAt)}</dd>
        </div>
        <div>
          <dt>Trending score</dt>
          <dd>{exact(s.trendingScore)}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>
            {s.license ?? "Not stated"}
            {s.gated ? (
              <span className="gated" title="The Hub asks visitors to accept conditions before downloading.">
                <Lock size={12} /> Gated
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <p className="star-readout">
        <span>Class {spectralClass(k)}</span>
        <span>{kelvin(k)}</span>
        <span>Magnitude {signed(magnitude(s.downloads))}</span>
      </p>

      {s.parents.length ? (
        <section className="panel-section">
          <h3>Built on</h3>
          <ul className="parents">
            {s.parents.map((p) => {
              const inHere = systemById(p.id);
              return (
                <li key={p.id}>
                  {inHere ? (
                    <button type="button" className="link-row" onClick={() => onSelect(p.id)}>
                      <ModelId id={p.id} />
                      <span className="relation">{FAMILY[p.relation].one} · a star here</span>
                    </button>
                  ) : (
                    <a className="link-row" href={hubUrl(p.id)} target="_blank" rel="noreferrer">
                      <ModelId id={p.id} />
                      <span className="relation">
                        {FAMILY[p.relation].one} <ArrowUpRight size={13} />
                      </span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="panel-section">
        <h3>
          Model tree <span className="count">{exact(total)} {plural(total, "model", "models")}</span>
        </h3>
        <ul className="families">
          {RELATIONS.map((r) => {
            const f = s.tree[r];
            const expanded = open === r;
            return (
              <li key={r} className={`family ${family === r ? "is-focused" : ""}`}>
                <button type="button" className="family-row" aria-expanded={expanded} onClick={() => toggle(r)} disabled={f.count === 0}>
                  <FamilyGlyph relation={r} size={22} />
                  <span className="family-name">
                    {FAMILY[r].many}
                    <em>{FAMILY[r].shape}</em>
                  </span>
                  <span className="family-count">{exact(f.count)}</span>
                  <span className="family-bar" aria-hidden="true">
                    <i style={{ width: `${(f.count / max) * 100}%`, background: `var(--color-orbit-${r})` }} />
                  </span>
                  {f.count ? <ChevronDown size={16} className="chev" /> : <span className="chev" />}
                </button>
                {expanded ? (
                  <ol className="members">
                    {f.top.map((m) => (
                      <li key={m.id} className={planet === m.id ? "is-picked" : ""}>
                        <a href={hubUrl(m.id)} target="_blank" rel="noreferrer" onMouseEnter={() => onPlanet(m.id)} onFocus={() => onPlanet(m.id)} onMouseLeave={() => onPlanet(null)}>
                          <ModelId id={m.id} />
                          <span className="member-stats">
                            {compact(m.downloads)} downloads{m.createdAt ? ` · ${day(m.createdAt)}` : ""}
                          </span>
                        </a>
                      </li>
                    ))}
                    {f.count > f.top.length ? (
                      <li className="members-more">
                        <a href={`https://huggingface.co/models?other=base_model:${r}:${s.id}`} target="_blank" rel="noreferrer">
                          All {exact(f.count)} on Hugging Face <ArrowUpRight size={13} />
                        </a>
                      </li>
                    ) : null}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="panel-note">
        {s.author} · {s.library ?? "library not stated"} · Hub data from {day(fetchedAt)}
      </p>
    </div>
  );
}
