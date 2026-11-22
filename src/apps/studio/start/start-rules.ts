import {
  addField,
  addRecordType,
  updateRecordType,
  type Draft,
} from "@/features/extraction/definition-draft";
import type { DefinitionTemplate } from "@/services/contracts";

/** What is sent to the assistant when the person leaves the box empty. */
export const DEFAULT_SUGGEST_MESSAGE = "Suggest fields for this document.";

/** The text to send for "Suggest fields": what the person wrote, or the default. */
export function suggestMessage(text: string): string {
  return text.trim() || DEFAULT_SUGGEST_MESSAGE;
}

/** The templates to offer as rows: every one but the empty one. */
export function startTemplates(templates: readonly DefinitionTemplate[]): DefinitionTemplate[] {
  return templates.filter((template) => template.id !== "blank");
}

/** How many fields a template brings, over all its record types. */
export function templateFieldCount(template: DefinitionTemplate): number {
  return template.definition.recordTypes.reduce((n, type) => n + type.fields.length, 0);
}

/** "Add a field yourself": a record type named "Record" with one field. */
export function startFromScratch(draft: Draft): Draft {
  const added = addRecordType(draft);
  const typeId = added.recordTypes[added.recordTypes.length - 1].id;
  return addField(updateRecordType(added, typeId, { name: "Record" }), typeId);
}
