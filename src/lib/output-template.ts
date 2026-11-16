import type {
  ExtractionDefinition,
  ExtractionRecord,
  FieldValue,
  RecordType,
} from "@/services/contracts";

export type TemplateValues = Record<string, string | string[] | null>;

/**
 * A record's values by field key. A `multiple` field gives a list (possibly
 * empty); a single field gives its value or null. Values whose review is
 * "rejected" are left out.
 */
export function recordValues(record: ExtractionRecord, recordType: RecordType): TemplateValues {
  const values: TemplateValues = {};
  for (const field of recordType.fields) {
    const found = record.fields
      .filter((v: FieldValue) => v.fieldId === field.id && v.review !== "rejected")
      .map((v) => v.value)
      .filter((v): v is string => v !== null);
    values[field.key] = field.multiple ? found : (found[0] ?? null);
  }
  return values;
}

const TAG =
  /\{\{\s*#([A-Za-z_][\w-]*)\s*\}\}([\s\S]*?)\{\{\s*\/\1\s*\}\}|\{\{\s*(\.|[A-Za-z_][\w-]*)\s*\}\}/g;

function render(template: string, values: TemplateValues, dot: string | null): string {
  // One pass, so a value that happens to contain "{{x}}" is never rendered again.
  return template.replace(TAG, (whole, sectionKey?: string, inner?: string, name?: string) => {
    if (sectionKey !== undefined && inner !== undefined) {
      if (!Object.hasOwn(values, sectionKey)) return whole;
      const value = values[sectionKey];
      const items = Array.isArray(value) ? value : value ? [value] : [];
      return items.map((item) => render(inner, values, item)).join("");
    }
    if (name === ".") return dot ?? "";
    const value = Object.hasOwn(values, name!) ? values[name!] : null;
    return Array.isArray(value) ? value.join(", ") : (value ?? "");
  });
}

/**
 * {{key}} is replaced by the value (a list joins with ", "; null or unknown
 * gives ""). {{#key}}…{{/key}} renders its inside once per value of a list
 * with {{.}} as that value, once for a non-empty single value, and not at all
 * when there is none. Unclosed or unknown section tags are left as written.
 * No HTML escaping.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  return render(template, values, null);
}

/** A starting template for a record type: a heading and one line per field. */
export function defaultTemplate(recordType: RecordType): string {
  const heading = `## ${recordType.name}`;
  const lines = recordType.fields.map((f) => `**${f.name}:** {{${f.key}}}`);
  return [heading, ...lines].join("\n\n");
}

function csvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const joinList = (value: string | string[] | null, separator: string) =>
  Array.isArray(value) ? value.join(separator) : (value ?? "");

/**
 * The output for one file in the definition's format. Records whose review is
 * "rejected", or whose record type is not in the definition, are left out.
 * json: pretty-printed array of `{ type, ...values }`. markdown: each record
 * through the template (a blank template means `defaultTemplate`), separated by
 * a blank line, `---` and a blank line. csv: RFC 4180 with CRLF line ends; a
 * header row of `type` plus the union of field keys in definition order, lists
 * joined with "; ". An empty list gives "[]", "" and the header row.
 */
export function renderOutput(
  definition: ExtractionDefinition,
  records: ExtractionRecord[],
): string {
  const types = new Map(definition.recordTypes.map((t) => [t.id, t]));
  const rows = records.flatMap((record) => {
    const recordType = types.get(record.recordTypeId);
    if (!recordType || record.review === "rejected") return [];
    return [{ recordType, values: recordValues(record, recordType) }];
  });
  const { format, template } = definition.output;

  if (format === "json") {
    return JSON.stringify(
      rows.map(({ recordType, values }) => ({ type: recordType.name, ...values })),
      null,
      2,
    );
  }

  if (format === "markdown") {
    return rows
      .map(({ recordType, values }) =>
        renderTemplate(template.trim() === "" ? defaultTemplate(recordType) : template, values),
      )
      .join("\n\n---\n\n");
  }

  const keys = [...new Set(definition.recordTypes.flatMap((t) => t.fields.map((f) => f.key)))];
  const lines = [
    ["type", ...keys],
    ...rows.map(({ recordType, values }) => [
      recordType.name,
      ...keys.map((key) => joinList(Object.hasOwn(values, key) ? values[key] : null, "; ")),
    ]),
  ];
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}
