import { plural } from "@/lib/format";
import type { DefinitionTemplate, OutputFormat } from "@/services/contracts";

const FORMAT_NAMES: Record<OutputFormat, string> = {
  markdown: "Markdown",
  json: "JSON",
  csv: "CSV",
};

/**
 * The quiet line under a template: what it sets up, from its definition.
 * "Skill · 5 fields · Markdown"; with several record types "2 record types · 7 fields · Markdown";
 * with none "Starts empty · Markdown".
 */
export function templateFact(definition: DefinitionTemplate["definition"]): string {
  const types = definition.recordTypes;
  const format = FORMAT_NAMES[definition.output.format];
  if (types.length === 0) return `Starts empty · ${format}`;
  const fields = types.reduce((n, t) => n + t.fields.length, 0);
  const what = types.length === 1 ? types[0].name : plural(types.length, "record type");
  return `${what} · ${plural(fields, "field")} · ${format}`;
}
