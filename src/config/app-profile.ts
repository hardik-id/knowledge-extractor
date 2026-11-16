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
 * - enrich: the enrich stage's output for the file (the full pipeline).
 */
export type ExtractionInputKind = "enrich";

export interface AppProfile {
  mode: AppMode;
  /** Product name in the header and the page title. */
  name: string;
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
    stages: STAGE_IDS,
    sources: ["confluence", "sharepoint", "upload"],
    extractionInput: "enrich",
    storagePrefix: "knowledge-extractor",
  },
};

export function profileFor(mode: AppMode): AppProfile {
  return PROFILES[mode];
}

export const appProfile: AppProfile = profileFor(env.appMode);
