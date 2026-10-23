/* The catalog's shape (format hugging-force/catalog@1), written by scripts/fetch-catalog.mjs from
   the Hugging Face Hub API and checked by validate.ts. Plain, erasable TypeScript so Node can run
   the validator directly (scripts/validate-catalog.mjs). */

/** Hugging Face's modalities that have an arm in the galaxy (the Hub's own ids). */
export type Modality = "nlp" | "cv" | "audio" | "multimodal";

/** How a derivative relates to its base model, as the Hub infers it (base_model_relation). */
export type Relation = "quantized" | "adapter" | "finetune" | "merge";

export interface Derivative {
  id: string;
  /** Downloads in the last 30 days. */
  downloads: number;
  likes: number;
  createdAt: string | null;
}

export interface Family {
  /** Every model the Hub lists under this relation on the day of the snapshot. */
  count: number;
  /** Up to five of the most downloaded, by name. */
  top: Derivative[];
}

export interface Parent {
  id: string;
  relation: Relation;
}

export interface ModelSystem {
  id: string;
  author: string;
  /** The Hub's pipeline tag, and its display name. */
  task: string;
  taskName: string;
  modality: Modality;
  library: string | null;
  license: string | null;
  gated: false | "auto" | "manual";
  /** When the repository was created on the Hub (2022-03-02 for repositories older than that date). */
  createdAt: string;
  /** Parameter count from the safetensors metadata, or null when the Hub reports none. */
  parameters: number | null;
  /** Downloads in the last 30 days. */
  downloads: number;
  downloadsAllTime: number;
  likes: number;
  trendingScore: number;
  /** The models the Hub lists as this one's base. */
  parents: Parent[];
  tree: Record<Relation, Family>;
}

export interface Catalog {
  format: "hugging-force/catalog@1";
  fetchedAt: string;
  source: {
    name: string;
    url: string;
    hub: string;
    taxonomy: string;
    notes: string;
  };
  systems: ModelSystem[];
}

export const MODALITIES: readonly Modality[] = ["nlp", "cv", "audio", "multimodal"];

/** Ordered by how far a derivative moves from its base's weights: the orbit families, inside out. */
export const RELATIONS: readonly Relation[] = ["quantized", "adapter", "finetune", "merge"];
