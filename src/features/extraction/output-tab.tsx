"use client";

import { Copy, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { MarkdownViewer } from "@/components/pipeline/markdown-viewer";
import { SplitView } from "@/components/pipeline/split-view";
import { useFileExtraction } from "@/features/run/use-extraction";
import { renderOutput } from "@/lib/output-template";
import { cn } from "@/lib/utils";
import type { ExtractionDefinition, OutputFormat } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useSelectedFiles } from "@/store/selectors";
import { STAGE_META } from "@/features/stages/config";

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
    <SplitView
      listLabel="Files with output"
      list={
        <ul className="flex flex-col gap-1 p-2">
          {rows.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => setActiveDoc(file.id)}
                aria-current={active?.id === file.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                  active?.id === file.id
                    ? "bg-surface-raised shadow-card"
                    : "hover:bg-surface-raised/60",
                )}
              >
                <FileText aria-hidden className="size-5 shrink-0 text-link" />
                <span className="block min-w-0 truncate text-[14px] leading-5 font-medium text-ink">
                  {file.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      }
      detail={active ? <FileOutput fileId={active.id} definition={definition} /> : null}
    />
  );
}

function FileOutput({ fileId, definition }: { fileId: string; definition: ExtractionDefinition }) {
  const { data, error, isLoading, retry } = useFileExtraction(fileId);
  const [rendered, setRendered] = useState(false);
  const format = definition.output.format;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 px-6 py-6">
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
      <div aria-busy="true" aria-label="Loading output" className="space-y-3 px-6 py-6">
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
      <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-raised px-6 py-3">
        <span className="text-[14px] font-medium text-ink">Output as {FORMAT_LABEL[format]}</span>
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
        <p className="px-6 py-6 text-ink-muted">Nothing was extracted from this file.</p>
      ) : format === "markdown" && rendered ? (
        <MarkdownViewer markdown={text} className="px-6 py-6" />
      ) : (
        <pre
          tabIndex={0}
          aria-label={`${FORMAT_LABEL[format]} output`}
          className={cn(
            "px-6 py-6 font-mono text-[13px] leading-5 text-ink",
            format === "csv" ? "overflow-x-auto whitespace-pre" : "break-words whitespace-pre-wrap",
          )}
        >
          {text}
        </pre>
      )}
    </div>
  );
}
