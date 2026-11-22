"use client";

import { Copy, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { MarkdownViewer } from "@/components/pipeline/markdown-viewer";
import { useFileExtraction } from "@/features/run/use-extraction";
import { renderOutput } from "@/lib/output-template";
import { cn } from "@/lib/utils";
import type { ExtractionDefinition, OutputFormat } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useSelectedFiles } from "@/store/selectors";
import { STAGE_META } from "@/features/stages/config";
import { FileList, ReviewPanes } from "./review-panes";

const FORMAT_LABEL: Record<OutputFormat, string> = {
  json: "JSON",
  markdown: "Markdown",
  csv: "CSV",
};

/** The extracted output of each file, in the saved definition's format. */
export function OutputTab({ definition }: { definition: ExtractionDefinition }) {
  const files = useSelectedFiles();
  const cells = usePipelineStore((s) => s.cells);
  const activeDocId = usePipelineStore((s) => s.activeDocId);
  const setActiveDoc = usePipelineStore((s) => s.setActiveDoc);

  const rows = files.filter((f) => cells[f.id]?.extract?.output);
  const active = rows.find((f) => f.id === activeDocId) ?? rows[0];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={STAGE_META.extract.icon}
        title="Run the extraction to see its output"
        description="The output appears here, in the format you chose on the Define tab."
      />
    );
  }

  return (
    <ReviewPanes
      listLabel="Files with output"
      list={
        <FileList
          icon={FileText}
          activeId={active?.id}
          onSelect={setActiveDoc}
          items={rows.map((file) => ({ id: file.id, name: file.name }))}
        />
      }
      detail={active ? <FileOutput fileId={active.id} definition={definition} /> : null}
    />
  );
}

export function FileOutput({
  fileId,
  definition,
}: {
  fileId: string;
  definition: ExtractionDefinition;
}) {
  const { data, error, isLoading, retry } = useFileExtraction(fileId);
  const [rendered, setRendered] = useState(false);
  const format = definition.output.format;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-4 sm:px-6">
        <p>
          <span className="font-semibold text-ink">Couldn&apos;t load the output.</span>{" "}
          {describeApiError(error)}
        </p>
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (isLoading || !data || data.fileId !== fileId) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading output"
        className="space-y-3 px-4 py-4 sm:px-6"
      >
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  const text = renderOutput(definition, data.records);
  const empty = data.records.length === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to the clipboard");
    } catch {
      toast.error("Couldn't copy", { description: "Select the text and copy it yourself." });
    }
  };

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-background px-4 py-2 sm:px-6">
        <span className="text-small font-medium text-ink">Output as {FORMAT_LABEL[format]}</span>
        {!empty && (
          <span className="flex items-center gap-2">
            {format === "markdown" && (
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={rendered}
                onClick={() => setRendered((v) => !v)}
              >
                {rendered ? "Show Markdown text" : "Show rendered"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              <Copy data-icon="inline-start" />
              Copy
            </Button>
          </span>
        )}
      </div>
      {empty ? (
        <p className="px-4 py-4 text-ink-muted sm:px-6">Nothing was extracted from this file.</p>
      ) : format === "markdown" && rendered ? (
        <MarkdownViewer markdown={text} className="px-4 py-4 sm:px-6" />
      ) : (
        <pre
          tabIndex={0}
          aria-label={`${FORMAT_LABEL[format]} output`}
          className={cn(
            "m-4 rounded-panel border border-border-subtle p-3 font-mono text-small text-ink sm:m-6",
            format === "csv" ? "overflow-x-auto whitespace-pre" : "break-words whitespace-pre-wrap",
          )}
        >
          {text}
        </pre>
      )}
    </div>
  );
}
