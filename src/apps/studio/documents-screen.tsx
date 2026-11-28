"use client";

import { plural } from "@/lib/format";
import { usePipelineStore } from "@/store/pipeline-store";
import { DocumentsPicker } from "./documents-picker";
import { WorkspaceTopBar } from "./workspace-top-bar";

/**
 * A workspace with no documents: the picker is the whole screen. Saving the selection gives the
 * run its documents, and the workspace screen then shows the working screen in its place.
 */
export function DocumentsScreen() {
  const count = usePipelineStore((s) => s.selectedFiles.length);
  return (
    <section aria-labelledby="studio-documents-title" className="flex flex-1 flex-col md:min-h-0">
      <WorkspaceTopBar />
      <h1 id="studio-documents-title" className="sr-only">
        Documents
      </h1>
      <DocumentsPicker
        submitLabel={count > 0 ? `Use ${plural(count, "document")}` : "Use documents"}
        workingLabel="Saving…"
        onSaved={() => {}}
      />
    </section>
  );
}
