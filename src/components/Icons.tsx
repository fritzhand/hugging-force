/* Icons that carry meaning next to color: one per arm (lucide), and one per orbit family, drawn
   as the shape the family takes in the universe (a belt, a ring, planets, comets). */
import { AudioLines, Blend, Eye, Languages, type LucideIcon } from "lucide-react";
import type { Modality, Relation } from "../data/types.ts";

export const ARM_ICON: Record<Modality, LucideIcon> = {
  nlp: Languages,
  cv: Eye,
  audio: AudioLines,
  multimodal: Blend,
};

export function ArmIcon({ arm, size = 16 }: { arm: Modality; size?: number }) {
  const Icon = ARM_ICON[arm];
  return <Icon size={size} aria-hidden="true" strokeWidth={2} />;
}

/** A family's shape, in its color. */
export function FamilyGlyph({ relation, size = 20 }: { relation: Relation; size?: number }) {
  const color = `var(--color-orbit-${relation})`;
  const star = <circle cx="12" cy="12" r="2.2" fill="var(--color-ink-primary)" />;
  let body;
  switch (relation) {
    case "quantized":
      body = (
        <g fill={color}>
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return <circle key={i} cx={12 + 6.2 * Math.cos(a)} cy={12 + 3.4 * Math.sin(a)} r={i % 3 ? 0.8 : 1.05} />;
          })}
        </g>
      );
      break;
    case "adapter":
      body = <ellipse cx="12" cy="12" rx="8.6" ry="3.2" fill="none" stroke={color} strokeWidth="1.8" />;
      break;
    case "finetune":
      body = (
        <g>
          <ellipse cx="12" cy="12" rx="8.8" ry="5.2" fill="none" stroke={color} strokeWidth="0.9" strokeDasharray="1.6 1.8" opacity="0.8" />
          <circle cx="20.2" cy="10.2" r="2.1" fill={color} />
          <circle cx="5.6" cy="15.4" r="1.5" fill={color} />
        </g>
      );
      break;
    case "merge":
      body = (
        <g>
          <path d="M17.5 6.5 L23 2.8" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
          <path d="M17.5 6.5 L22.4 4.6" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.4" />
          <circle cx="17.2" cy="6.8" r="2" fill={color} />
          <path d="M17.2 6.8 C 6 4, 2 14, 12 18" fill="none" stroke={color} strokeWidth="0.9" strokeDasharray="1.4 1.8" opacity="0.7" />
        </g>
      );
      break;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {body}
      {star}
    </svg>
  );
}
