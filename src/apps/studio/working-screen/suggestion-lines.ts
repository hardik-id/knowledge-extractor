import type { ProposalChange } from "@/features/extraction/proposal-diff";
import { plural } from "@/lib/format";
import type { ExtractionDefinitionDraft } from "@/services/contracts";

/** The most lines a suggestion card shows; the rest are counted ("and 4 more"). */
export const MAX_SUGGESTION_LINES = 8;
/** The most field names an "Add 5 fields" line spells out before "...". */
const MAX_NAMES = 4;

type Definition = Pick<ExtractionDefinitionDraft, "recordTypes">;

const quoted = (name: string) => `'${name}'`;

/** The words after "Change 'X' ..." for the kinds of change to one field, read from the end of the change's text (fixed words the code writes, never the model's names). */
const FIELD_ENDINGS: [string, (name: string) => string][] = [
  ["type changed to choice", (n) => `Change ${n} to a choice`],
  ["type changed to date", (n) => `Change ${n} to a date`],
  ["type changed to number", (n) => `Change ${n} to a number`],
  ["type changed to text", (n) => `Change ${n} to text`],
  ["now quoted from the text", (n) => `Change ${n} to quoted from the text`],
  ["now worked out by the model", (n) => `Change ${n} to worked out by the model`],
  ["choices changed", (n) => `Change the choices of ${n}`],
  ["now takes several values", (n) => `Let ${n} take several values`],
  ["now takes one value", (n) => `Let ${n} take one value`],
  ["description changed", (n) => `Change the description of ${n}`],
];

/** Lower number, more important: what adds or removes things comes before what only changes them. */
const RANK: Record<ProposalChange["kind"], number> = {
  "added-type": 0,
  "added-field": 1,
  "changed-field": 2,
  "removed-field": 3,
  "removed-type": 4,
  "changed-type": 5,
  prompt: 6,
  output: 7,
};

function typeNameIn(def: Definition, typeId: string | null): string {
  return def.recordTypes.find((t) => t.id === typeId)?.name.trim() || "Unnamed record type";
}

function fieldNameIn(defs: Definition[], fieldId: string | null): string {
  for (const def of defs) {
    for (const type of def.recordTypes) {
      const field = type.fields.find((f) => f.id === fieldId);
      if (field) return field.name.trim() || field.key;
    }
  }
  return "a field";
}

/**
 * What a suggestion would change, in plain words, one change per line, most important first:
 * "Add 5 fields to 'ADR': Title, Status, ...", "Change 'Status' to a choice", "Remove 'Owner'",
 * "Change what to extract". Past `max` lines the rest is one line, "and 4 more". The names come from
 * the language model: the lines are plain text to be shown as text.
 */
export function suggestionLines(
  changes: readonly ProposalChange[],
  current: Definition,
  proposed: Definition,
  max = MAX_SUGGESTION_LINES,
): string[] {
  const lines: { rank: number; text: string }[] = [];
  const added = new Map<string, { rank: number; names: string[] }>();
  for (const c of changes) {
    const rank = RANK[c.kind];
    switch (c.kind) {
      case "added-field": {
        const key = c.typeId ?? "";
        const group = added.get(key) ?? { rank, names: [] };
        group.names.push(fieldNameIn([proposed], c.fieldId));
        added.set(key, group);
        break;
      }
      case "removed-field":
        lines.push({ rank, text: `Remove ${quoted(fieldNameIn([current, proposed], c.fieldId))}` });
        break;
      case "changed-field": {
        const name = quoted(fieldNameIn([proposed, current], c.fieldId));
        const ending = FIELD_ENDINGS.find(([end]) => c.text.endsWith(end));
        const text = ending
          ? ending[1](name)
          : c.text.includes(" renamed to ")
            ? `Rename a field to ${name}`
            : `Change ${name}`;
        lines.push({ rank, text });
        break;
      }
      case "added-type": {
        const fields = proposed.recordTypes.find((t) => t.id === c.typeId)?.fields.length ?? 0;
        const name = quoted(typeNameIn(proposed, c.typeId));
        lines.push({
          rank,
          text:
            fields > 0
              ? `Add record type ${name} with ${plural(fields, "field")}`
              : `Add record type ${name}`,
        });
        break;
      }
      case "removed-type":
        lines.push({ rank, text: `Remove record type ${quoted(typeNameIn(current, c.typeId))}` });
        break;
      case "changed-type":
        lines.push({
          rank,
          text:
            c.part === "name"
              ? `Rename record type to ${quoted(typeNameIn(proposed, c.typeId))}`
              : `Change what ${quoted(typeNameIn(proposed, c.typeId))} is`,
        });
        break;
      case "prompt":
        lines.push({ rank, text: "Change what to extract" });
        break;
      case "output":
        lines.push({
          rank,
          text:
            c.text === "Template changed"
              ? "Change the output template"
              : "Change the output format",
        });
        break;
    }
  }
  for (const [typeId, group] of added) {
    const shown = group.names.slice(0, MAX_NAMES).join(", ");
    const more = group.names.length > MAX_NAMES ? ", ..." : "";
    lines.push({
      rank: group.rank,
      text: `Add ${plural(group.names.length, "field")} to ${quoted(typeNameIn(proposed, typeId))}: ${shown}${more}`,
    });
  }
  // A stable sort keeps the order the changes came in within one rank.
  const ordered = lines.sort((a, b) => a.rank - b.rank).map((l) => l.text);
  if (ordered.length <= max) return ordered;
  return [...ordered.slice(0, max), `and ${ordered.length - max} more`];
}
