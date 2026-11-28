import type { FieldDef } from "@/services/contracts";

const TYPE_WORDS: Record<FieldDef["valueType"], string> = {
  text: "Text",
  date: "Date",
  number: "Number",
  choice: "Choice",
};

/** What a read-only field list says of a field besides its name: "Date · Exact quote · Several values". */
export function fieldFacts(field: Pick<FieldDef, "valueType" | "mode" | "multiple">): string {
  return [
    TYPE_WORDS[field.valueType],
    field.mode === "quote" ? "Exact quote" : null,
    field.multiple ? "Several values" : null,
  ]
    .filter((fact) => fact !== null)
    .join(" · ");
}
