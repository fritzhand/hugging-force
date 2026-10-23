/* Search the catalog by name, owner, task or arm. "/" focuses it; arrows and Enter pick a result. */
import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ModelSystem } from "../data/types.ts";
import { MODALITY } from "../lib/modality.ts";
import { search } from "../lib/search.ts";
import { splitId } from "../lib/format.ts";

interface Props {
  systems: readonly ModelSystem[];
  onPick(id: string): void;
}

export function SearchBox({ systems, onPick }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hits = useMemo(() => search(systems, q), [systems, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (id: string) => {
    onPick(id);
    setQ("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search" role="search">
      <Search size={16} className="search-icon" aria-hidden="true" />
      <input
        ref={input}
        type="search"
        value={q}
        placeholder="Search models"
        aria-label="Search models by name, owner, task or modality"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            pick(hits[active].system.id);
          } else if (e.key === "Escape") {
            setQ("");
            setOpen(false);
            input.current?.blur();
          }
        }}
      />
      {q ? (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQ("")}>
          <X size={14} />
        </button>
      ) : (
        <kbd className="search-key" aria-hidden="true">/</kbd>
      )}
      <ul id={listId} role="listbox" className="search-results" hidden={!open || !q.trim()}>
        {hits.length ? (
          hits.map((h, i) => {
            const [owner, name] = splitId(h.system.id);
            return (
              <li
                key={h.system.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "is-active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(h.system.id);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="swatch" style={{ background: `var(--color-arm-${h.system.modality})` }} />
                <span className="result-id">
                  <span className="model-owner">{owner}/</span>
                  {name}
                </span>
                <span className="result-task">
                  {MODALITY[h.system.modality].label} · {h.system.taskName}
                </span>
              </li>
            );
          })
        ) : (
          <li className="search-empty" role="option" aria-selected="false">
            No model matches “{q.trim()}”.
          </li>
        )}
      </ul>
    </div>
  );
}
