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

/** One thing applying a proposal would change, with where it is and the words for it. */
export interface ProposalChange {
  kind:
    | "added-field"
    | "removed-field"
    | "changed-field"
    | "added-type"
    | "removed-type"
    | "prompt"
    | "output";
  /** The record type it concerns (the proposal's id, or the current one's for a removal); null for the prompt and the output. */
  typeId: string | null;
  /** The field it concerns; null when it is not about one field. */
  fieldId: string | null;
  text: string;
}

function fieldChanges(typeId: string, owner: string, a: FieldDef, b: FieldDef): ProposalChange[] {
  const where = `${owner} / ${fieldName(b)}`;
  const out: ProposalChange[] = [];
  const changed = (text: string) =>
    out.push({ kind: "changed-field", typeId, fieldId: b.id, text });
  if (a.name.trim() !== b.name.trim()) {
    changed(`${owner}: field “${fieldName(a)}” renamed to “${fieldName(b)}”`);
  }
  if (a.mode !== b.mode) changed(`${where}: now ${MODE_LABEL[b.mode]}`);
  if (a.valueType !== b.valueType) changed(`${where}: type changed to ${TYPE_LABEL[b.valueType]}`);
  if (a.valueType === "choice" && b.valueType === "choice" && !sameList(a.choices, b.choices)) {
    changed(`${where}: choices changed`);
  }
  if (a.multiple !== b.multiple) {
    changed(`${where}: ${b.multiple ? "now takes several values" : "now takes one value"}`);
  }
  if (a.description.trim() !== b.description.trim()) changed(`${where}: description changed`);
  return out;
}

/** What applying `proposal` would change in `current`, item by item. Empty when nothing. */
export function proposalChanges(
  current: ExtractionDefinitionDraft,
  proposal: ExtractionDefinitionDraft,
): ProposalChange[] {
  const out: ProposalChange[] = [];
  if (current.prompt.trim() !== proposal.prompt.trim()) {
    out.push({ kind: "prompt", typeId: null, fieldId: null, text: "Prompt changed" });
  }

  const types = pair(current.recordTypes, proposal.recordTypes, (t) => t.name);
  for (const t of types.added) {
    out.push({
      kind: "added-type",
      typeId: t.id,
      fieldId: null,
      text: `Record type added: ${typeName(t)}`,
    });
  }
  for (const t of types.removed) {
    out.push({
      kind: "removed-type",
      typeId: t.id,
      fieldId: null,
      text: `Record type removed: ${typeName(t)}`,
    });
  }
  for (const [a, b] of types.pairs) {
    if (a.name.trim() !== b.name.trim()) {
      out.push({
        kind: "changed-field",
        typeId: b.id,
        fieldId: null,
        text: `Record type renamed: ${typeName(a)} to ${typeName(b)}`,
      });
    }
    const owner = typeName(b);
    if (a.description.trim() !== b.description.trim()) {
      out.push({
        kind: "changed-field",
        typeId: b.id,
        fieldId: null,
        text: `${owner}: description changed`,
      });
    }
    const fields = pair(a.fields, b.fields, (f) => f.key || f.name);
    // The key is a second chance: a field the assistant re-issued with a new id and name.
    const byName = pair(fields.removed, fields.added, (f) => f.name);
    for (const f of byName.added) {
      out.push({
        kind: "added-field",
        typeId: b.id,
        fieldId: f.id,
        text: `${owner}: field added: ${fieldName(f)}`,
      });
    }
    for (const f of byName.removed) {
      out.push({
        kind: "removed-field",
        typeId: b.id,
        fieldId: f.id,
        text: `${owner}: field removed: ${fieldName(f)}`,
      });
    }
    for (const [x, y] of [...fields.pairs, ...byName.pairs]) {
      out.push(...fieldChanges(b.id, owner, x, y));
    }
  }

  if (current.output.format !== proposal.output.format) {
    out.push({
      kind: "output",
      typeId: null,
      fieldId: null,
      text: `Output format changed to ${FORMAT_LABEL[proposal.output.format]}`,
    });
  }
  if (current.output.template !== proposal.output.template) {
    out.push({ kind: "output", typeId: null, fieldId: null, text: "Template changed" });
  }
  return out;
}

/** What applying `proposal` would change in `current`, in plain words. Empty when nothing. */
export function diffProposal(
  current: ExtractionDefinitionDraft,
  proposal: ExtractionDefinitionDraft,
): string[] {
  return proposalChanges(current, proposal).map((c) => c.text);
}

/** What became of a proposal: still to decide, applied, dismissed, or replaced by a newer one. */
export type ProposalOutcome = "open" | "applied" | "dismissed" | "replaced";

/**
 * What a proposal card shows, given its `outcome` and how many changes applying
 * it would make. Applying or dismissing is only remembered on the page, so after
 * a reload, or in another tab, a proposal applied earlier is open again; when it
 * changes nothing in what the person has, it is already in it ("included"), and
 * Apply would do nothing.
 */
export function shownOutcome(
  outcome: ProposalOutcome,
  changeCount: number,
): ProposalOutcome | "included" {
  return outcome === "open" && changeCount === 0 ? "included" : outcome;
}
