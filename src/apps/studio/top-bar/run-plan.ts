import type { StageCell } from "@/services/contracts";

export interface RunPlanInput {
  /** The ids of the run's documents, in order. */
  fileIds: string[];
  /** The open document. */
  activeId: string | null;
  /** The extract cell of each document. */
  cells: Record<string, StageCell | undefined>;
  /** The definition version each document's records come from. A document not listed is not known yet. */
  versions: Record<string, number | undefined>;
  /** The versions could not be loaded: a document with results then counts as out of date. */
  versionsFailed?: boolean;
  /** The saved version of the configuration. */
  savedVersion: number;
  /** The configuration has unsaved changes: it will be saved as a new version by the run. */
  dirty: boolean;
  /** The configuration has no record type. */
  empty: boolean;
  /** An extraction is going. */
  running: boolean;
}

export interface RunChoice {
  label: string;
  /** The documents to run on; undefined is every document. */
  fileIds?: string[];
}

export interface RunPlan {
  /** What the button says and does. */
  main: RunChoice;
  /** The button is the orange one; "Run again" is the secondary look. */
  primary: boolean;
  disabled: boolean;
  /** Another way to run, in the menu next to the button. */
  alternative?: RunChoice;
}

/** A document is current when it has results from the saved configuration, and nothing is unsaved. */
function isCurrent(input: RunPlanInput, id: string): boolean {
  const cell = input.cells[id];
  if (!cell?.output || cell.status === "failed" || cell.status === "stale") return false;
  if (input.dirty) return false;
  const version = input.versions[id];
  // Not known yet (still loading): not taken as out of date. Not known after an error: it is,
  // so the button does not claim the results are current.
  if (version === undefined) return !input.versionsFailed;
  return version === input.savedVersion;
}

const allLabel = (count: number) =>
  count === 0 ? "Run" : count === 1 ? "Run on this document" : `Run on all ${count} documents`;

/** What the one Run button says and does, from the state of each document. */
export function planRun(input: RunPlanInput): RunPlan {
  const count = input.fileIds.length;
  const disabled = input.empty || input.running || count === 0;
  const all: RunChoice = { label: allLabel(count) };
  const active =
    input.activeId && input.fileIds.includes(input.activeId) ? input.activeId : input.fileIds[0];

  // An empty configuration leaves the orange action to the start panel; a run going keeps it.
  if (disabled || !active) return { main: all, primary: !input.empty, disabled: true };

  if (!isCurrent(input, active)) {
    return {
      main: { label: "Run on this document", fileIds: [active] },
      primary: true,
      disabled: false,
      alternative: count > 1 ? all : undefined,
    };
  }
  if (input.fileIds.some((id) => !isCurrent(input, id))) {
    return { main: all, primary: true, disabled: false };
  }
  return { main: { label: "Run again" }, primary: false, disabled: false };
}
