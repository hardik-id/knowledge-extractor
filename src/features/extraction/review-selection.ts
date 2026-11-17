import type {
  ExtractionRecord,
  FieldDef,
  FieldValueInput,
  RecordType,
  TextSpan,
} from "@/services/contracts";

/** Pure rules behind the selection menu: what a selection turns into, and where the menu sits. */

/** The selected text on one line, cut to `max` characters: “We store orders in…”. */
export function shortenQuote(text: string, max = 40): string {
  const line = text.replace(/\s+/g, " ").trim();
  const cut = line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
  return `“${cut}”`;
}

/** The title of a record card: its first field's value, or "<Type> <n>". Keep in step with the records pane. */
export function recordHeading(
  record: ExtractionRecord,
  type: RecordType | undefined,
  records: ExtractionRecord[],
): string {
  const first = type?.fields[0] ? record.fields.find((v) => v.fieldId === type.fields[0].id) : null;
  const same = records.filter((r) => r.recordTypeId === record.recordTypeId);
  const number = same.findIndex((r) => r.id === record.id) + 1;
  return first?.value?.trim() || `${type?.name ?? "Record"} ${number}`;
}

/**
 * The values to send when a field gets a new one. A field that takes several
 * values keeps the ones it has; any other is replaced.
 */
export function valuesWithNew(
  record: ExtractionRecord,
  field: Pick<FieldDef, "id" | "multiple">,
  added: { value: string; span: TextSpan },
): FieldValueInput[] {
  const incoming: FieldValueInput = { value: added.value, spans: [added.span] };
  if (!field.multiple) return [incoming];
  const existing = record.fields
    .filter((v) => v.fieldId === field.id && v.value !== null)
    .map((v) => ({ value: v.value, spans: v.spans }));
  return [...existing, incoming];
}

export interface Place {
  left: number;
  top: number;
}

/**
 * Where to put the menu, in the coordinates of the box it sits in: just
 * below the end of the selection, moved sideways so it stays inside the box.
 * `anchor` is the end of the selection in the same coordinates.
 */
export function placeMenu(args: {
  anchor: { x: number; bottom: number };
  boxWidth: number;
  menuWidth: number;
  gap?: number;
}): Place {
  const { anchor, boxWidth, menuWidth, gap = 8 } = args;
  const room = Math.max(boxWidth - menuWidth, 0);
  return { left: Math.min(Math.max(anchor.x - menuWidth / 2, 0), room), top: anchor.bottom + gap };
}
