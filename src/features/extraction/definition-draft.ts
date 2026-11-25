import { newId } from "@/lib/id";
import {
  CHUNK_SIZE_DEFAULT,
  CHUNK_SIZE_MAX,
  CHUNK_SIZE_MIN,
  type ChunkingStrategy,
  type CustomChunking,
  normalChunking,
  type ExtractionDefinition,
  type ExtractionDefinitionDraft,
  type FieldDef,
  type OutputFormat,
  type RecordType,
} from "@/services/contracts";

/** The editable part of a definition. */
export type Draft = ExtractionDefinitionDraft;

export function toDraft(definition: ExtractionDefinition): Draft {
  const { prompt, recordTypes, output } = definition;
  // One shape for the same setting, so an untouched version is never "unsaved": a version from
  // before chunking, or a stored size on an automatic one, reads as automatic with no size.
  const chunking = definition.chunking ?? { strategy: "auto", size: null };
  return structuredClone({
    prompt,
    recordTypes,
    output,
    chunking: normalChunking(chunking),
  });
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

/**
 * Chooses the chunking strategy. A strategy other than automatic takes the size it has, else 4000;
 * automatic clears the size. `custom` is kept only while the strategy is custom: switching away
 * drops the code from what is saved.
 */
export function setChunkingStrategy(draft: Draft, strategy: ChunkingStrategy): Draft {
  return {
    ...draft,
    chunking: normalChunking({
      strategy,
      size: strategy === "auto" ? null : (draft.chunking.size ?? CHUNK_SIZE_DEFAULT),
      custom: draft.chunking.custom,
    }),
  };
}

/**
 * Chooses a strategy the way the row does: like `setChunkingStrategy`, and coming back to Custom
 * with no code in the draft takes back `remembered`, the code last applied in this session.
 */
export function chooseChunkingStrategy(
  draft: Draft,
  strategy: ChunkingStrategy,
  remembered: CustomChunking | null,
): Draft {
  const next = setChunkingStrategy(draft, strategy);
  if (strategy === "custom" && !next.chunking.custom && remembered) {
    return setCustomChunking(next, remembered);
  }
  return next;
}

/** Puts applied splitting code into the draft (and makes the strategy custom), or takes it out with null. */
export function setCustomChunking(draft: Draft, custom: CustomChunking | null): Draft {
  const size = draft.chunking.size ?? CHUNK_SIZE_DEFAULT;
  return { ...draft, chunking: { strategy: "custom", size, custom } };
}

/** The applied code differs from what the boxes now say: Generate has to be run again. */
export function customIsStale(
  applied: CustomChunking | null | undefined,
  instruction: string,
  sourceUrl: string,
): boolean {
  if (!applied) return false;
  return (
    applied.instruction.trim() !== instruction.trim() ||
    (applied.sourceUrl ?? "") !== sourceUrl.trim()
  );
}

/** Sets the size, or null while the box is empty or not a number (validation says what is wrong). */
export function setChunkingSize(draft: Draft, size: number | null): Draft {
  return { ...draft, chunking: { ...draft.chunking, size } };
}

/** What the size box holds becomes a size: a whole number, or null for an empty or other text. NaN-safe. */
export function parseChunkSize(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The closed row's words: "Automatic", "By paragraph, 4000 characters". */
export const CHUNKING_LABELS: Record<ChunkingStrategy, string> = {
  auto: "Automatic",
  heading: "By heading",
  paragraph: "By paragraph",
  fixed: "Fixed size",
  custom: "Custom",
};

export function chunkingSummary(chunking: Draft["chunking"]): string {
  const label = CHUNKING_LABELS[chunking.strategy];
  if (chunking.strategy === "auto") return label;
  if (chunking.strategy === "custom" && !chunking.custom?.code)
    return `${label}, not generated yet`;
  return chunking.size == null ? label : `${label}, ${chunking.size} characters`;
}

/** The problem with the chunk size, or null. Automatic has no size to check. */
export function chunkSizeError(chunking: Draft["chunking"]): string | null {
  if (chunking.strategy === "auto") return null;
  const { size } = chunking;
  if (size == null || !Number.isInteger(size) || size < CHUNK_SIZE_MIN || size > CHUNK_SIZE_MAX) {
    return `Enter a whole number from ${CHUNK_SIZE_MIN} to ${CHUNK_SIZE_MAX}.`;
  }
  return null;
}

export const CUSTOM_CODE_MISSING = "Generate and apply the splitting code first.";

/** Custom chunking without applied code can't be saved or run. */
export function customCodeError(chunking: Draft["chunking"]): string | null {
  if (chunking.strategy !== "custom") return null;
  return chunking.custom?.code?.trim() ? null : CUSTOM_CODE_MISSING;
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
  /** The chunk size, when it is not a whole number from 1000 to 8000. */
  chunkSize?: string;
  /** Custom chunking chosen but no splitting code applied. */
  chunkCode?: string;
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
  const chunkSize = chunkSizeError(draft.chunking);
  if (chunkSize) errors.chunkSize = chunkSize;
  const chunkCode = customCodeError(draft.chunking);
  if (chunkCode) errors.chunkCode = chunkCode;
  return errors;
}

export function isValid(errors: DraftErrors): boolean {
  return (
    errors.general.length === 0 &&
    Object.keys(errors.types).length === 0 &&
    Object.keys(errors.fields).length === 0 &&
    !errors.chunkSize &&
    !errors.chunkCode
  );
}
