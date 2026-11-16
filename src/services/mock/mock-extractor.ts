import type {
  ExtractionDefinition,
  ExtractionDefinitionDraft,
  ExtractionRecord,
  FieldDef,
  FieldValue,
  RecordType,
  TextSpan,
} from "../contracts";

/**
 * A stand-in for the model that extracts records. Pure and deterministic, and
 * driven by the definition: a block is a `## ` heading that starts with a record
 * type's name, and a field is a `**Label:** value` line or a `### Label` section.
 */

export interface ExtractOptions {
  fileId: string;
  newId: () => string;
  /** Alter the first quote value so it no longer occurs in the text (`anchored: false`). */
  unanchorFirst?: boolean;
}

interface Range {
  /** String indices into the text. */
  start: number;
  end: number;
}

interface Line extends Range {
  text: string;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const norm = (label: string) =>
  label
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ")
    .trim();

function splitLines(text: string, from: number, to: number): Line[] {
  const lines: Line[] = [];
  let start = from;
  while (start <= to) {
    let end = text.indexOf("\n", start);
    if (end === -1 || end > to) end = to;
    lines.push({ start, end, text: text.slice(start, end).replace(/\r$/, "") });
    start = end + 1;
  }
  return lines;
}

/** Index → code point offset, for every string index of `text`. */
function codePointOffsets(text: string): Int32Array {
  const map = new Int32Array(text.length + 1);
  let count = 0;
  for (let i = 0; i < text.length;) {
    const width = text.codePointAt(i)! > 0xffff ? 2 : 1;
    for (let k = 0; k < width; k++) map[i + k] = count;
    i += width;
    count++;
  }
  map[text.length] = count;
  return map;
}

function trimRange(text: string, range: Range): Range {
  let { start, end } = range;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end };
}

/** The ISO date for "3 November 2026", "November 3, 2026" or "2026-11-03"; null if it doesn't parse. */
export function parseDate(text: string): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const dayFirst = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})/.exec(text);
  const monthFirst = /([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(text);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [+iso[1], +iso[2], +iso[3]];
  else if (dayFirst && MONTHS.includes(dayFirst[2].toLowerCase())) {
    [y, m, d] = [+dayFirst[3], MONTHS.indexOf(dayFirst[2].toLowerCase()) + 1, +dayFirst[1]];
  } else if (monthFirst && MONTHS.includes(monthFirst[1].toLowerCase())) {
    [y, m, d] = [+monthFirst[3], MONTHS.indexOf(monthFirst[1].toLowerCase()) + 1, +monthFirst[2]];
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalise(field: FieldDef, text: string): string {
  if (field.valueType === "choice") {
    const lower = text.toLowerCase();
    return field.choices.find((c) => lower.includes(c.toLowerCase()))?.toLowerCase() ?? lower;
  }
  if (field.valueType === "date") return parseDate(text) ?? text;
  return text;
}

/** Where a field's text is inside one block: one range, or one per comma-separated item. */
function findField(text: string, lines: Line[], field: FieldDef): Range[] | null {
  const names = [norm(field.name), norm(field.key)].filter(Boolean);
  const labels = new Set(names);
  if (labels.has("decided on")) labels.add("date");

  // The heading text after "ADR-012: ".
  if (labels.has("title")) {
    const heading = lines[0];
    const prefix = /^##\s+(?:\S+-\d+\s*[:–-]\s*)?/.exec(heading.text)![0].length;
    const range = trimRange(text, { start: heading.start + prefix, end: heading.end });
    if (range.end > range.start) return [range];
  }

  for (const [i, line] of lines.entries()) {
    const labelled = /^\*\*(.+?):\*\*[ \t]*(.*)$/.exec(line.text);
    if (labelled && labels.has(norm(labelled[1]))) {
      const valueStart = line.start + line.text.length - labelled[2].length;
      const range = trimRange(text, { start: valueStart, end: line.end });
      if (range.end === range.start) continue;
      if (!field.multiple) return [range];
      const items: Range[] = [];
      let from = range.start;
      for (const part of text.slice(range.start, range.end).split(",")) {
        const item = trimRange(text, { start: from, end: from + part.length });
        if (item.end > item.start) items.push(item);
        from += part.length + 1;
      }
      return items.length > 0 ? items : null;
    }
    const section = /^###\s+(.*)$/.exec(line.text);
    if (section && labels.has(norm(section[1]))) {
      const next = lines.findIndex((l, j) => j > i && /^#{1,6}\s/.test(l.text));
      const end = next === -1 ? lines[lines.length - 1].end : lines[next].start;
      const range = trimRange(text, { start: line.end + 1, end });
      if (range.end > range.start) return [range];
    }
  }
  return null;
}

function blocksFor(text: string, recordType: RecordType): Range[] {
  const name = recordType.name.trim().toLowerCase();
  if (!name) return [];
  const lines = splitLines(text, 0, text.length);
  const headings = lines.filter((l) => /^##\s/.test(l.text));
  const blocks: Range[] = [];
  for (const heading of headings) {
    if (
      !heading.text
        .replace(/^##\s+/, "")
        .toLowerCase()
        .startsWith(name)
    )
      continue;
    const next = headings.find((h) => h.start > heading.start);
    const range = trimRange(text, { start: heading.start, end: next ? next.start : text.length });
    blocks.push(range);
  }
  return blocks;
}

export function extractRecords(
  text: string,
  definition: ExtractionDefinition | ExtractionDefinitionDraft,
  { fileId, newId, unanchorFirst = false }: ExtractOptions,
): ExtractionRecord[] {
  const offsets = codePointOffsets(text);
  const span = (r: Range): TextSpan => ({
    start: offsets[r.start],
    end: offsets[r.end],
    quote: text.slice(r.start, r.end),
  });
  let unanchor = unanchorFirst;
  const records: ExtractionRecord[] = [];

  for (const recordType of definition.recordTypes) {
    for (const block of blocksFor(text, recordType)) {
      const lines = splitLines(text, block.start, block.end);
      const fields: FieldValue[] = [];

      for (const field of recordType.fields) {
        const base = {
          fieldId: field.id,
          origin: "llm" as const,
          review: "suggested" as const,
          anchored: true,
        };
        const found = findField(text, lines, field);
        if (!found) {
          fields.push({ id: newId(), value: null, spans: [], ...base });
          continue;
        }
        if (field.mode === "quote") {
          for (const range of found) {
            const value: FieldValue = {
              id: newId(),
              value: text.slice(range.start, range.end),
              spans: [span(range)],
              ...base,
            };
            if (unanchor) {
              unanchor = false;
              const altered = `${value.value} (not in the document)`;
              value.value = altered;
              value.spans[0].quote = altered;
              value.anchored = false;
            }
            fields.push(value);
          }
        } else {
          for (const range of found) {
            fields.push({
              id: newId(),
              value: normalise(field, text.slice(range.start, range.end)),
              spans: [span(range)],
              ...base,
            });
          }
        }
      }

      records.push({
        id: newId(),
        fileId,
        recordTypeId: recordType.id,
        span: span(block),
        fields,
        origin: "llm",
        review: "suggested",
        useAsExample: false,
      });
    }
  }
  return records;
}
