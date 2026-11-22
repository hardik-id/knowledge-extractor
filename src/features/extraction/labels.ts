import type { ExtractionDefinition, FieldDef, RecordType } from "@/services/contracts";

/**
 * Every field of an extraction definition gets one of six label styles, by its
 * position across all record types. After six the styles repeat, so a colour
 * is never the only signal: highlights and chips always show the field's name.
 *
 * Tailwind only generates classes it can read in full, so the class names are
 * written out here rather than built from the index.
 */

export const LABEL_COUNT = 6;

export interface LabelStyle {
  /** 1 to 6. */
  index: number;
  /** Soft background for highlighted text. */
  highlight: string;
  /** The colour of the underline under highlighted text. */
  underline: string;
  /** A small tag: soft background, outline and text in the label colour. */
  chip: string;
  /** Text and icon colour. */
  text: string;
}

const STYLES: readonly LabelStyle[] = [
  {
    index: 1,
    highlight: "bg-label-1-soft",
    underline: "border-label-1",
    chip: "border-label-1 bg-label-1-soft text-label-1",
    text: "text-label-1",
  },
  {
    index: 2,
    highlight: "bg-label-2-soft",
    underline: "border-label-2",
    chip: "border-label-2 bg-label-2-soft text-label-2",
    text: "text-label-2",
  },
  {
    index: 3,
    highlight: "bg-label-3-soft",
    underline: "border-label-3",
    chip: "border-label-3 bg-label-3-soft text-label-3",
    text: "text-label-3",
  },
  {
    index: 4,
    highlight: "bg-label-4-soft",
    underline: "border-label-4",
    chip: "border-label-4 bg-label-4-soft text-label-4",
    text: "text-label-4",
  },
  {
    index: 5,
    highlight: "bg-label-5-soft",
    underline: "border-label-5",
    chip: "border-label-5 bg-label-5-soft text-label-5",
    text: "text-label-5",
  },
  {
    index: 6,
    highlight: "bg-label-6-soft",
    underline: "border-label-6",
    chip: "border-label-6 bg-label-6-soft text-label-6",
    text: "text-label-6",
  },
];

/** The label index (1 to 6) for the field at this position (from 0). */
export function labelIndexAt(position: number): number {
  const n = Math.max(0, Math.floor(position) || 0);
  return (n % LABEL_COUNT) + 1;
}

/** The style for a label index. Any integer is accepted and wrapped into 1 to 6. */
export function labelStyle(index: number): LabelStyle {
  const n = Number.isFinite(index) ? Math.floor(index) : 1;
  return STYLES[(((n - 1) % LABEL_COUNT) + LABEL_COUNT) % LABEL_COUNT];
}

export interface FieldLabel {
  field: FieldDef;
  recordType: RecordType;
  /** 1 to 6. */
  index: number;
  style: LabelStyle;
}

/** The label of every field of the definition, by field id. Stable while the definition's fields keep their order. */
export function fieldLabels(
  definition: Pick<ExtractionDefinition, "recordTypes">,
): Map<string, FieldLabel> {
  const labels = new Map<string, FieldLabel>();
  let position = 0;
  for (const recordType of definition.recordTypes) {
    for (const field of recordType.fields) {
      const index = labelIndexAt(position++);
      labels.set(field.id, { field, recordType, index, style: labelStyle(index) });
    }
  }
  return labels;
}
