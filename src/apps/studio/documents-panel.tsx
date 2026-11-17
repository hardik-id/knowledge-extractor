"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileBrowser, SelectionSummary } from "@/features/file-picker/file-browser";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { StudioPanel } from "./studio-panel";

/** Pick documents from storage; the one primary button creates the run and opens extraction. */
export function DocumentsPanel() {
  const router = useRouter();
  const count = usePipelineStore((s) => s.selectedFiles.length);
  const ensureRun = usePipelineStore((s) => s.ensureRun);
  const starting = usePipelineStore((s) => s.creatingRun);

  const open = async () => {
    try {
      await ensureRun();
    } catch (error) {
      toast.error("Couldn't open the documents", { description: describeApiError(error) });
      return;
    }
    router.push("/studio/extract");
  };

  return (
    <StudioPanel
      id="studio-documents"
      title="Documents"
      description="Choose enriched documents from your storage container."
      status={<SelectionSummary itemNoun="document" />}
      actions={
        <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-4">
          {count === 0 && (
            <p id="open-hint" className="text-[13px] leading-[18px] text-ink-muted sm:text-right">
              Select at least one document.
            </p>
          )}
          <Button
            onClick={() => void open()}
            disabled={count === 0 || starting}
            aria-describedby={count === 0 ? "open-hint" : undefined}
          >
            {starting ? (
              <>
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
                Opening…
              </>
            ) : (
              <>
                Open in extraction
                <ArrowRight data-icon="inline-end" />
              </>
            )}
          </Button>
        </div>
      }
    >
      <FileBrowser
        sources={["storage"]}
        itemNoun="document"
        searchHint="Search by name or folder"
      />
    </StudioPanel>
  );
}
