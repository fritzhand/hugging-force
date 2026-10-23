/* Where the universe's canvas lives on a page. The engine is shared: this element borrows its
   canvas while mounted and pauses it while off screen. */
import { useEffect, useRef } from "react";
import type { UniverseEngine } from "../three/engine.ts";

interface Props {
  engine: UniverseEngine | null;
  className?: string;
  label: string;
}

export function SceneHost({ engine, className, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!engine || !host) return;
    engine.attach(host);
    const io = new IntersectionObserver(([e]) => engine.setActive(e.isIntersecting), { threshold: 0 });
    io.observe(host);
    return () => {
      io.disconnect();
      engine.detach(host);
    };
  }, [engine]);
  return <div ref={ref} className={`scene-host ${className ?? ""}`} role="img" aria-label={label} />;
}
