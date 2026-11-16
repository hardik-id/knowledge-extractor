import { newId } from "@/lib/id";
import type {
  ExtractionDefinition,
  ExtractionDefinitionDraft,
  FieldDef,
  OutputFormat,
  RecordType,
} from "@/services/contracts";

/** The editable part of a definition. */
export type Draft = ExtractionDefinitionDraft;

export function toDraft(definition: ExtractionDefinition): Draft {
  const { version: _version, ...draft } = definition;
  void _version;
  return structuredClone(draft);
}

export function isDirty(draft: Draft, saved: ExtractionDefinition): boolean {
  return JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
}

/** "Approved by" becomes "approved_by". Unique among `taken`. Never empty. */
export function deriveKey(name: string, taken: readonly string[] = []): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function newField(taken: readonly string[] = []): FieldDef {
  return {
    id: newId(),
    key: deriveKey("", taken),
    name: "",
    description: "",
    mode: "quote",
    valueType: "text",
    choices: [],
    multiple: false,
  };
}

export function newRecordType(): RecordType {
  return { id: newId(), name: "", description: "", fields: [] };
}

function mapType(draft: Draft, typeId: string, fn: (t: RecordType) => RecordType): Draft {
  return { ...draft, recordTypes: draft.recordTypes.map((t) => (t.id === typeId ? fn(t) : t)) };
}

export function addRecordType(draft: Draft): Draft {
  return { ...draft, recordTypes: [...draft.recordTypes, newRecordType()] };
}

export function removeRecordType(draft: Draft, typeId: string): Draft {
  return { ...draft, recordTypes: draft.recordTypes.filter((t) => t.id !== typeId) };
}

export function updateRecordType(
  draft: Draft,
  typeId: string,
  patch: Partial<Pick<RecordType, "name" | "description">>,
): Draft {
  return mapType(draft, typeId, (t) => ({ ...t, ...patch }));
}

export function addField(draft: Draft, typeId: string): Draft {
  return mapType(draft, typeId, (t) => ({
    ...t,
    fields: [...t.fields, newField(t.fields.map((f) => f.key))],
  }));
}

export function removeField(draft: Draft, typeId: string, fieldId: string): Draft {
  return mapType(draft, typeId, (t) => ({
    ...t,
    fields: t.fields.filter((f) => f.id !== fieldId),
  }));
}

/** Moves a field one place up (-1) or down (1). Does nothing at either end. */
export function moveField(draft: Draft, typeId: string, fieldId: string, delta: -1 | 1): Draft {
  return mapType(draft, typeId, (t) => {
    const from = t.fields.findIndex((f) => f.id === fieldId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= t.fields.length) return t;
    const fields = [...t.fields];
    [fields[from], fields[to]] = [fields[to]!, fields[from]!];
    return { ...t, fields };
  });
}

/**
 * Changes a field. Renaming derives the key from the new name, unless the
 * person has edited the key themselves (it no longer matches the old name's key).
 */
export function updateField(
  draft: Draft,
  typeId: string,
  fieldId: string,
  patch: Partial<Omit<FieldDef, "id">>,
): Draft {
  return mapType(draft, typeId, (t) => ({
    ...t,
    fields: t.fields.map((f) => {
      if (f.id !== fieldId) return f;
      const others = t.fields.filter((o) => o.id !== fieldId).map((o) => o.key);
      const next = { ...f, ...patch };
      if (patch.name !== undefined && patch.key === undefined) {
        const followed = f.key === deriveKey(f.name, others) || f.name === "";
        if (followed) next.key = deriveKey(patch.name, others);
      }
      return next;
    }),
  }));
}

export function setOutputFormat(draft: Draft, format: OutputFormat): Draft {
  return { ...draft, output: { ...draft.output, format } };
}

export function setTemplate(draft: Draft, template: string): Draft {
  return { ...draft, output: { ...draft.output, template } };
}

/** "a, b ,, c" becomes ["a", "b", "c"]. */
export function parseChoices(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface DraftErrors {
  /** Problems with a record type's own name, by record type id. */
  types: Record<string, string>;
  /** Problems with a field, by field id. */
  fields: Record<string, { name?: string; key?: string; choices?: string }>;
  /** Problems with the definition as a whole. */
  general: string[];
}

export function validateDraft(draft: Draft): DraftErrors {
  const errors: DraftErrors = { types: {}, fields: {}, general: [] };
  if (draft.recordTypes.length === 0) {
    errors.general.push("Add at least one record type.");
  }
  for (const type of draft.recordTypes) {
    if (type.name.trim() === "") errors.types[type.id] = "Give this record type a name.";
    const counts = new Map<string, number>();
    for (const f of type.fields) counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
    for (const f of type.fields) {
      const e: { name?: string; key?: string; choices?: string } = {};
      if (f.name.trim() === "") e.name = "Give this field a name.";
      if (f.key.trim() === "") e.key = "Give this field a key.";
      else if ((counts.get(f.key) ?? 0) > 1)
        e.key = "Another field uses this key. Keys must differ.";
      if (f.valueType === "choice" && f.choices.length === 0) {
        e.choices = "List the allowed values, separated by commas.";
      }
      if (e.name || e.key || e.choices) errors.fields[f.id] = e;
    }
  }
  return errors;
}

export function isValid(errors: DraftErrors): boolean {
  return (
    errors.general.length === 0 &&
    Object.keys(errors.types).length === 0 &&
    Object.keys(errors.fields).length === 0
  );
}
