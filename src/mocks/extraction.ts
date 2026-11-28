import type { ExtractionDefinitionDraft } from "@/services/contracts";
import { DEFAULT_TEMPLATE_ID, MOCK_TEMPLATES } from "./templates";

/** The ADR template's definition: what a workspace starts from when none is chosen. Kept in `templates.ts`, in one place. */
export const DEFAULT_EXTRACTION_DEFINITION: ExtractionDefinitionDraft = MOCK_TEMPLATES.find(
  (t) => t.id === DEFAULT_TEMPLATE_ID,
)!.definition;
