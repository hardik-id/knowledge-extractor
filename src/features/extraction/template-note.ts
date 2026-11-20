import { MAX_DEFINITION_NOTE_LENGTH } from "@/services/contracts";

/** The note a template's save starts with. */
export function templateNote(name: string): string {
  return `From template: ${name}`.slice(0, MAX_DEFINITION_NOTE_LENGTH);
}

/** The suggested note after the draft changed: it only lasts while the draft differs from the saved version. */
export function keptSuggestedNote(suggested: string, dirty: boolean): string {
  return dirty ? suggested : "";
}

/** The note a save sends: the one typed, otherwise the suggestion; nothing when blank. */
export function noteForSave(typed: string | undefined, suggested: string): string | undefined {
  return (typed ?? suggested).trim() || undefined;
}
