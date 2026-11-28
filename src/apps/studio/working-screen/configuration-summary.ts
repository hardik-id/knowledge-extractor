import { chunkingSummary, type Draft } from "@/features/extraction/definition-draft";
import { plural } from "@/lib/format";

/**
 * What the "Configuration" row says next to its name, as one line:
 * "ADR · 5 fields · Automatic chunking", "2 record types · 9 fields · Automatic chunking",
 * "Nothing configured yet". While a suggestion waits it adds "3 suggested changes".
 */
export function configurationSummary(
  draft: Pick<Draft, "recordTypes" | "prompt" | "chunking">,
  suggestedChanges = 0,
): string {
  const types = draft.recordTypes;
  const parts: string[] = [];
  if (types.length === 0 && !draft.prompt.trim()) {
    parts.push("Nothing configured yet");
  } else {
    const fields = types.reduce((sum, t) => sum + t.fields.length, 0);
    if (types.length === 1) parts.push(types[0].name.trim() || "Unnamed record type");
    else if (types.length > 1) parts.push(plural(types.length, "record type"));
    parts.push(plural(fields, "field"));
    parts.push(chunkingText(draft.chunking));
  }
  if (suggestedChanges > 0) parts.push(plural(suggestedChanges, "suggested change"));
  return parts.join(" · ");
}

function chunkingText(chunking: Draft["chunking"]): string {
  return chunking.strategy === "auto"
    ? `${chunkingSummary(chunking)} chunking`
    : `Chunking: ${chunkingSummary(chunking).toLowerCase()}`;
}
