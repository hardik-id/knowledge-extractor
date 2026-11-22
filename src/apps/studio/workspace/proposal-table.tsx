"use client";

import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import type { FieldDef } from "@/services/contracts";

/** Stubs until item 10: the assistant's proposal, shown in the table. Each renders nothing. */

/** "3 suggested changes · Keep all · Discard all", above the table. */
export function ProposalBar(props: { definition: ExtractionDefinitionState }) {
  void props;
  return null;
}

/** The changes proposed to one existing field, as lines under its row. */
export function ProposalLines(props: { field: FieldDef }) {
  void props;
  return null;
}

/** The fields proposed for the record type, as table rows (`tr`) marked "New field". */
export function ProposedFieldRows(props: { typeId: string }) {
  void props;
  return null;
}
