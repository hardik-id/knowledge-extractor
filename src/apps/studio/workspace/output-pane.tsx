"use client";

import { FileOutput } from "@/features/extraction/output-tab";
import { OutputSettings } from "@/features/extraction/output-settings";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";

/**
 * The output of the open document, and the format and template that shape it. The output follows
 * the draft, so a change to the format shows at once, before it is saved.
 */
export function OutputPane({
  fileId,
  definition,
}: {
  fileId: string;
  definition: ExtractionDefinitionState;
}) {
  const { saved, draft, setDraft } = definition;
  if (!saved || !draft) return null;
  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-6 pb-6">
      <FileOutput fileId={fileId} definition={{ ...saved, ...draft }} />
      <div className="px-4 sm:px-6">
        <OutputSettings draft={draft} setDraft={setDraft} />
      </div>
    </div>
  );
}
