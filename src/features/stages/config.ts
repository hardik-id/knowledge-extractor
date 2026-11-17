import {
  CloudDownload,
  DatabaseZap,
  FileText,
  FolderSearch,
  ListTree,
  Sparkles,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { StageId } from "@/types/pipeline";

export interface StageMeta {
  id: StageId;
  /** Sidebar and heading label */
  label: string;
  /** One sentence shown under the stage heading */
  description: string;
  /** Verb phrase for the proceed button: "Proceed to <label>" uses `label`; this is for the action inside the stage */
  actionLabel: string;
  icon: LucideIcon;
}

/**
 * Stage metadata. Order comes from `STAGE_IDS`.
 * Safe to import from server and client components (no React state).
 * The panel for each stage lives in ./panels.ts.
 */
export const STAGE_META: Record<StageId, StageMeta> = {
  select: {
    id: "select",
    label: "File selector",
    description:
      "Find documents in Confluence or SharePoint, or upload them, and choose which to process.",
    actionLabel: "Select files",
    icon: FolderSearch,
  },
  ingest: {
    id: "ingest",
    label: "Ingestion",
    description: "Download the selected files from their source so they can be processed.",
    actionLabel: "Start ingestion",
    icon: CloudDownload,
  },
  transform: {
    id: "transform",
    label: "Transformation",
    description: "Convert PDFs, Office files and web pages into clean Markdown.",
    actionLabel: "Convert to Markdown",
    icon: FileText,
  },
  classify: {
    id: "classify",
    label: "Classification",
    description: "Assign each document a type, topic and sensitivity level.",
    actionLabel: "Run classification",
    icon: Tags,
  },
  enrich: {
    id: "enrich",
    label: "Enrichment",
    description: "Add summaries, keywords and links to related documents.",
    actionLabel: "Run enrichment",
    icon: Sparkles,
  },
  extract: {
    id: "extract",
    label: "Knowledge extraction",
    description: "Pull out entities, facts and tables into structured fields.",
    actionLabel: "Run extraction",
    icon: ListTree,
  },
  index: {
    id: "index",
    label: "Indexing",
    description: "Chunk, embed and write documents to the search index.",
    actionLabel: "Build index",
    icon: DatabaseZap,
  },
};
