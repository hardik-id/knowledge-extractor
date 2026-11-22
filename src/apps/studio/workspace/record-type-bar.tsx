"use client";

import { plural } from "@/lib/format";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { useWorkspace } from "./workspace-state";

/** A stub until item 8: the selected record type's name and "n fields" only. */
export function RecordTypeBar({ definition }: { definition: ExtractionDefinitionState }) {
  const { selectedTypeId } = useWorkspace();
  const type = definition.draft?.recordTypes.find((t) => t.id === selectedTypeId);
  if (!type) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle py-2 pr-3 pl-4">
      <h2 className="text-body font-semibold text-ink-heading">{type.name || "Record type"}</h2>
      <span className="text-small text-ink-muted">{plural(type.fields.length, "field")}</span>
    </div>
  );
}
