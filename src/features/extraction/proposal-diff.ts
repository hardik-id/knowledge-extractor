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
    | "changed-type"
    | "added-type"
    | "removed-type"
    | "prompt"
    | "output";
  /** The record type it concerns (the proposal's id, or the current one's for a removal); null for the prompt and the output. */
  typeId: string | null;
  /** The field it concerns; null when it is not about one field ("changed-type" is about the record type itself). */
  fieldId: string | null;
  /** For "changed-type": which part of the record type it sets. Never read from the text, which carries model-chosen names. */
  part?: "name" | "description";
  text: string;
}

type FieldPatch = Partial<
  Pick<FieldDef, "name" | "mode" | "valueType" | "choices" | "multiple" | "description">
>;

/** The changes to one field, each with the part of the field it sets. */
function fieldChangeEntries(
  typeId: string,
  owner: string,
  a: FieldDef,
  b: FieldDef,
): { change: ProposalChange; patch: FieldPatch }[] {
  const where = `${owner} / ${fieldName(b)}`;
  const out: { change: ProposalChange; patch: FieldPatch }[] = [];
  const changed = (text: string, patch: FieldPatch) =>
    out.push({ change: { kind: "changed-field", typeId, fieldId: b.id, text }, patch });
  if (a.name.trim() !== b.name.trim()) {
    changed(`${owner}: field “${fieldName(a)}” renamed to “${fieldName(b)}”`, { name: b.name });
  }
  if (a.mode !== b.mode) changed(`${where}: now ${MODE_LABEL[b.mode]}`, { mode: b.mode });
  if (a.valueType !== b.valueType) {
    changed(`${where}: type changed to ${TYPE_LABEL[b.valueType]}`, {
      valueType: b.valueType,
      choices: b.choices,
    });
  }
  if (a.valueType === "choice" && b.valueType === "choice" && !sameList(a.choices, b.choices)) {
    changed(`${where}: choices changed`, { choices: b.choices });
  }
  if (a.multiple !== b.multiple) {
    changed(`${where}: ${b.multiple ? "now takes several values" : "now takes one value"}`, {
      multiple: b.multiple,
    });
  }
  if (a.description.trim() !== b.description.trim()) {
    changed(`${where}: description changed`, { description: b.description });
  }
  return out;
}

/** The fields of a record type paired with the proposal's: by id, key, then name. */
function pairFields(a: readonly FieldDef[], b: readonly FieldDef[]) {
  const fields = pair(a, b, (f) => f.key || f.name);
  // The key is a second chance: a field the assistant re-issued with a new id and name.
  const byName = pair(fields.removed, fields.added, (f) => f.name);
  return {
    pairs: [...fields.pairs, ...byName.pairs],
    added: byName.added,
    removed: byName.removed,
  };
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
        kind: "changed-type",
        typeId: b.id,
        fieldId: null,
        part: "name",
        text: `Record type renamed: ${typeName(a)} to ${typeName(b)}`,
      });
    }
    const owner = typeName(b);
    if (a.description.trim() !== b.description.trim()) {
      out.push({
        kind: "changed-type",
        typeId: b.id,
        fieldId: null,
        part: "description",
        text: `${owner}: description changed`,
      });
    }
    const fields = pairFields(a.fields, b.fields);
    for (const f of fields.added) {
      out.push({
        kind: "added-field",
        typeId: b.id,
        fieldId: f.id,
        text: `${owner}: field added: ${fieldName(f)}`,
      });
    }
    for (const f of fields.removed) {
      out.push({
        kind: "removed-field",
        typeId: b.id,
        fieldId: f.id,
        text: `${owner}: field removed: ${fieldName(f)}`,
      });
    }
    for (const [x, y] of fields.pairs) {
      out.push(...fieldChangeEntries(b.id, owner, x, y).map((e) => e.change));
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

/** Puts `item` where the proposal has it: after the nearest earlier sibling the list already holds. */
function insertLike<T extends { id: string }>(list: readonly T[], item: T, proposed: readonly T[]) {
  const at = proposed.findIndex((p) => p.id === item.id);
  let index = 0;
  for (let i = at - 1; i >= 0; i--) {
    const found = list.findIndex((t) => t.id === proposed[i]!.id);
    if (found >= 0) {
      index = found + 1;
      break;
    }
  }
  return [...list.slice(0, index), item, ...list.slice(index)];
}

/**
 * `draft` with only `change` put in, one of the changes `proposalChanges(draft, proposal)` lists.
 * It pairs record types and fields the way that function does. A change that is no longer there
 * (it was in the draft already) leaves the draft as it is.
 */
export function applyChange(
  draft: ExtractionDefinitionDraft,
  proposal: ExtractionDefinitionDraft,
  change: ProposalChange,
): ExtractionDefinitionDraft {
  if (change.kind === "prompt") return { ...draft, prompt: proposal.prompt };
  if (change.kind === "output") {
    const output =
      change.text === "Template changed"
        ? { ...draft.output, template: proposal.output.template }
        : { ...draft.output, format: proposal.output.format };
    return { ...draft, output };
  }

  const types = pair(draft.recordTypes, proposal.recordTypes, (t) => t.name);
  if (change.kind === "added-type") {
    const t = types.added.find((x) => x.id === change.typeId);
    if (!t) return draft;
    return {
      ...draft,
      recordTypes: insertLike(draft.recordTypes, structuredClone(t), proposal.recordTypes),
    };
  }
  if (change.kind === "removed-type") {
    if (!types.removed.some((t) => t.id === change.typeId)) return draft;
    return { ...draft, recordTypes: draft.recordTypes.filter((t) => t.id !== change.typeId) };
  }

  const found = types.pairs.find(([, b]) => b.id === change.typeId);
  if (!found) return draft;
  const [a, b] = found;
  const withType = (patch: (t: RecordType) => RecordType): ExtractionDefinitionDraft => ({
    ...draft,
    recordTypes: draft.recordTypes.map((t) => (t.id === a.id ? patch(t) : t)),
  });

  if (change.kind === "changed-type") {
    return change.part === "name"
      ? withType((t) => ({ ...t, name: b.name }))
      : withType((t) => ({ ...t, description: b.description }));
  }

  const fields = pairFields(a.fields, b.fields);
  if (change.kind === "added-field") {
    const f = fields.added.find((x) => x.id === change.fieldId);
    if (!f) return draft;
    return withType((t) => ({ ...t, fields: insertLike(t.fields, { ...f }, b.fields) }));
  }
  if (change.kind === "removed-field") {
    if (!fields.removed.some((f) => f.id === change.fieldId)) return draft;
    return withType((t) => ({ ...t, fields: t.fields.filter((f) => f.id !== change.fieldId) }));
  }
  // changed-field
  for (const [x, y] of fields.pairs) {
    if (y.id !== change.fieldId) continue;
    const entry = fieldChangeEntries(b.id, typeName(b), x, y).find(
      (e) => e.change.text === change.text,
    );
    if (!entry) continue;
    return withType((t) => ({
      ...t,
      fields: t.fields.map((f) => (f.id === x.id ? { ...f, ...entry.patch } : f)),
    }));
  }
  return draft;
}

/**
 * `draft` with all of `changes` put in, one pass: record types and fields are paired once, so it
 * stays fast for a proposal with thousands of fields (applying them one by one is cubic).
 */
export function applyChanges(
  draft: ExtractionDefinitionDraft,
  proposal: ExtractionDefinitionDraft,
  changes: readonly ProposalChange[],
): ExtractionDefinitionDraft {
  let out = draft;
  for (const c of changes) {
    if (c.kind === "prompt") out = { ...out, prompt: proposal.prompt };
    else if (c.kind === "output") out = applyChange(out, proposal, c);
  }
  const typeChanges = changes.filter((c) => c.typeId !== null);
  if (typeChanges.length === 0) return out;

  const types = pair(draft.recordTypes, proposal.recordTypes, (t) => t.name);
  const addedTypes = new Set(
    typeChanges.filter((c) => c.kind === "added-type").map((c) => c.typeId),
  );
  const removedTypes = new Set(
    typeChanges.filter((c) => c.kind === "removed-type").map((c) => c.typeId),
  );
  const byType = new Map<string, ProposalChange[]>();
  for (const c of typeChanges) {
    if (c.kind === "added-type" || c.kind === "removed-type") continue;
    byType.set(c.typeId!, [...(byType.get(c.typeId!) ?? []), c]);
  }

  const patched = new Map<string, RecordType>();
  for (const [a, b] of types.pairs) {
    const mine = byType.get(b.id);
    if (!mine) continue;
    let t = { ...a };
    for (const c of mine) {
      if (c.kind !== "changed-type") continue;
      if (c.part === "name") t = { ...t, name: b.name };
      else t = { ...t, description: b.description };
    }
    const fieldChanges = mine.filter((c) => c.fieldId !== null);
    if (fieldChanges.length > 0) {
      const fields = pairFields(a.fields, b.fields);
      const add = new Set(
        fieldChanges.filter((c) => c.kind === "added-field").map((c) => c.fieldId),
      );
      const remove = new Set(
        fieldChanges.filter((c) => c.kind === "removed-field").map((c) => c.fieldId),
      );
      const patches = new Map<string, FieldPatch>();
      for (const [x, y] of fields.pairs) {
        const wanted = fieldChanges.filter((c) => c.kind === "changed-field" && c.fieldId === y.id);
        if (wanted.length === 0) continue;
        for (const e of fieldChangeEntries(b.id, typeName(b), x, y)) {
          if (wanted.some((c) => c.text === e.change.text)) {
            patches.set(x.id, { ...patches.get(x.id), ...e.patch });
          }
        }
      }
      const removable = new Set(fields.removed.filter((f) => remove.has(f.id)).map((f) => f.id));
      let list = t.fields
        .filter((f) => !removable.has(f.id))
        .map((f) => (patches.has(f.id) ? { ...f, ...patches.get(f.id) } : f));
      for (const f of fields.added) {
        if (add.has(f.id)) list = insertLike(list, { ...f }, b.fields);
      }
      t = { ...t, fields: list };
    }
    patched.set(a.id, t);
  }

  let recordTypes = out.recordTypes
    .filter((t) => !removedTypes.has(t.id) || !types.removed.some((r) => r.id === t.id))
    .map((t) => patched.get(t.id) ?? t);
  for (const t of types.added) {
    if (addedTypes.has(t.id))
      recordTypes = insertLike(recordTypes, structuredClone(t), proposal.recordTypes);
  }
  return { ...out, recordTypes };
}

/** Identifies a change by what it is, so it can be told apart after the draft it was worked out against has changed. */
export function changeKey(change: ProposalChange): string {
  return [
    change.kind,
    change.typeId ?? "",
    change.fieldId ?? "",
    change.part ?? "",
    change.text,
  ].join("\u0000");
}
