import { STAGE_IDS, type SourceKind, type StageId } from "@/types/pipeline";
import { env, type AppMode } from "./env";

/**
 * One codebase builds more than one app. A profile says which stages an app
 * shows, which sources it lists files from, and where extraction reads its text.
 * Pure data, safe to import on the server and in the proxy.
 *
 * Code that differs per app reads `appProfile`, never `env.appMode` directly.
 */

/**
 * Where the extraction stage reads the text it works on.
 * - enrich:   the enrich stage's output for the file (the full pipeline).
 * - document: the document itself, read from storage (`services.documents`).
 *             The run file's `sourceRef` is the document id.
 */
export type ExtractionInputKind = "enrich" | "document";

export interface AppProfile {
  mode: AppMode;
  /** Product name in the header and the page title. */
  name: string;
  /** Compact brand mark shown on narrow screens. */
  shortName: string;
  /** What the app calls the things a person selects: "file" or "document". */
  itemNoun: string;
  /** Hint in the file search box. */
  searchHint: string;
  /** Why a stage is locked until the one before it is done. */
  stageGateNote: string;
  /** Opening line of the extraction Define tab. */
  definitionNote: string;
  /** The stages this app shows, in run order. Always starts with "select". */
  stages: readonly StageId[];
  /** The sources the file selector offers, in tab order. */
  sources: readonly SourceKind[];
  extractionInput: ExtractionInputKind;
  /** Prefix for browser storage keys, so two apps on one origin keep apart. */
  storagePrefix: string;
}

const PROFILES: Record<AppMode, AppProfile> = {
  pipeline: {
    mode: "pipeline",
    name: "Knowledge Extractor",
    shortName: "KX",
    itemNoun: "file",
    searchHint: "Search by name or space",
    stageGateNote: "Each stage works on the output of the one before it.",
    definitionNote:
      "This definition starts from the pipeline's extraction settings and applies to this run only.",
    stages: STAGE_IDS,
    sources: ["confluence", "sharepoint", "upload"],
    extractionInput: "enrich",
    storagePrefix: "knowledge-extractor",
  },
  studio: {
    mode: "studio",
    name: "Knowledge Studio",
    shortName: "KS",
    itemNoun: "document",
    searchHint: "Search by name or folder",
    stageGateNote: "Extraction works on the documents you choose.",
    definitionNote: "This definition applies to this run only.",
    stages: ["select", "extract"],
    sources: ["storage"],
    extractionInput: "document",
    storagePrefix: "knowledge-studio",
  },
};

export function profileFor(mode: AppMode): AppProfile {
  return PROFILES[mode];
}

export const appProfile: AppProfile = profileFor(env.appMode);
