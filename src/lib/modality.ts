/* The arms' names. `hub` is Hugging Face's own label for the modality (data/tasks.json). */
import type { Modality } from "../data/types.ts";

export const MODALITY: Record<Modality, { label: string; hub: string }> = {
  nlp: { label: "Language", hub: "Natural Language Processing" },
  cv: { label: "Vision", hub: "Computer Vision" },
  audio: { label: "Audio", hub: "Audio" },
  multimodal: { label: "Multimodal", hub: "Multimodal" },
};

/** The orbit families' names, singular and plural, and the shape each takes. */
export const FAMILY = {
  quantized: { one: "quantization", many: "Quantizations", shape: "belt" },
  adapter: { one: "adapter", many: "Adapters", shape: "ring" },
  finetune: { one: "fine-tune", many: "Fine-tunes", shape: "planets" },
  merge: { one: "merge", many: "Merges", shape: "comets" },
} as const;
