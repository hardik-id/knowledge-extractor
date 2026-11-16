import type { ExtractionDefinitionDraft, FieldDef, RecordType } from "@/services/contracts";

const MODE_LABEL: Record<FieldDef["mode"], string> = {
  quote: "quoted from the text",
  inferred: "worked out by the model",
};

const TYPE_LABEL: Record<FieldDef["valueType"], string> = {
  text: "text",
  date: "date",
  number: "number",
  choice: "choice",
};

const FORMAT_LABEL = { json: "JSON", markdown: "Markdown", csv: "CSV" } as const;

const norm = (s: string) => s.trim().toLowerCase();

/** Pairs items by id first, then by a name the assistant may have kept while issuing new ids. */
function pair<T extends { id: string }>(
  current: readonly T[],
  proposed: readonly T[],
  nameOf: (item: T) => string,
): { pairs: [T, T][]; removed: T[]; added: T[] } {
  const pairs: [T, T][] = [];
  const left = [...current];
  const right = [...proposed];
  const take = (match: (a: T, b: T) => boolean) => {
    for (let i = left.length - 1; i >= 0; i--) {
      const j = right.findIndex((b) => match(left[i]!, b));
      if (j >= 0) {
        pairs.unshift([left[i]!, right[j]!]);
        left.splice(i, 1);
        right.splice(j, 1);
      }
    }
  };
  take((a, b) => a.id === b.id);
  take((a, b) => norm(nameOf(a)) !== "" && norm(nameOf(a)) === norm(nameOf(b)));
  return { pairs, removed: left, added: right };
}

const typeName = (t: RecordType) => t.name.trim() || "Unnamed record type";
const fieldName = (f: FieldDef) => f.name.trim() || f.key;
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function fieldChanges(owner: string, a: FieldDef, b: FieldDef): string[] {
  const where = `${owner} / ${fieldName(b)}`;
  const out: string[] = [];
  if (a.name.trim() !== b.name.trim()) {
    out.push(`${owner}: field “${fieldName(a)}” renamed to “${fieldName(b)}”`);
  }
  if (a.mode !== b.mode) out.push(`${where}: now ${MODE_LABEL[b.mode]}`);
  if (a.valueType !== b.valueType) out.push(`${where}: type changed to ${TYPE_LABEL[b.valueType]}`);
  if (a.valueType === "choice" && b.valueType === "choice" && !sameList(a.choices, b.choices)) {
    out.push(`${where}: choices changed`);
  }
  if (a.multiple !== b.multiple) {
    out.push(`${where}: ${b.multiple ? "now takes several values" : "now takes one value"}`);
  }
  if (a.description.trim() !== b.description.trim()) out.push(`${where}: description changed`);
  return out;
}

/** What applying `proposal` would change in `current`, in plain words. Empty when nothing. */
export function diffProposal(
  current: ExtractionDefinitionDraft,
  proposal: ExtractionDefinitionDraft,
): string[] {
  const out: string[] = [];
  if (current.prompt.trim() !== proposal.prompt.trim()) out.push("Prompt changed");

  const types = pair(current.recordTypes, proposal.recordTypes, (t) => t.name);
  for (const t of types.added) out.push(`Record type added: ${typeName(t)}`);
  for (const t of types.removed) out.push(`Record type removed: ${typeName(t)}`);
  for (const [a, b] of types.pairs) {
    if (a.name.trim() !== b.name.trim()) {
      out.push(`Record type renamed: ${typeName(a)} to ${typeName(b)}`);
    }
    const owner = typeName(b);
    if (a.description.trim() !== b.description.trim()) {
      out.push(`${owner}: description changed`);
    }
    const fields = pair(a.fields, b.fields, (f) => f.key || f.name);
    // The key is a second chance: a field the assistant re-issued with a new id and name.
    const byName = pair(fields.removed, fields.added, (f) => f.name);
    for (const f of byName.added) out.push(`${owner}: field added: ${fieldName(f)}`);
    for (const f of byName.removed) out.push(`${owner}: field removed: ${fieldName(f)}`);
    for (const [x, y] of [...fields.pairs, ...byName.pairs]) out.push(...fieldChanges(owner, x, y));
  }

  if (current.output.format !== proposal.output.format) {
    out.push(`Output format changed to ${FORMAT_LABEL[proposal.output.format]}`);
  }
  if (current.output.template !== proposal.output.template) out.push("Template changed");
  return out;
}
