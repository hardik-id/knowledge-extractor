"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/store/pipeline-store";
import type { DocumentState, DocumentStateKind } from "./document-states";
import { DocumentsSheet } from "../documents-sheet";
import { useDocumentStates } from "./use-document-states";

const TONE: Record<DocumentStateKind, string> = {
  "not-run": "text-ink-muted",
  running: "text-ink-muted",
  failed: "text-danger",
  "to-review": "text-ink-muted",
  reviewed: "text-success",
  "nothing-found": "text-ink-muted",
  unavailable: "text-ink-muted",
};

function StateMark({ kind }: { kind: DocumentStateKind }) {
  if (kind === "reviewed") return <Check aria-hidden className="size-3.5" />;
  if (kind === "to-review") {
    return <span aria-hidden className="size-2 rounded-pill border-2 border-warning" />;
  }
  return null;
}

function StateText({ state }: { state: DocumentState | undefined }) {
  if (!state) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-small whitespace-nowrap",
        TONE[state.kind],
      )}
    >
      <StateMark kind={state.kind} />
      {state.label}
    </span>
  );
}

/**
 * The open document in the top bar: its name, "n of N", previous and next, and a menu of the
 * project's documents with their state. File names come from storage: they are text only.
 */
export function DocumentSwitcher() {
  const runFiles = usePipelineStore((s) => s.runFiles);
  const activeDocId = usePipelineStore((s) => s.activeDocId);
  const setActiveDoc = usePipelineStore((s) => s.setActiveDoc);
  const states = useDocumentStates();
  const [picking, setPicking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const found = runFiles.findIndex((f) => f.id === activeDocId);
  // An id that is not among the run's files (removed, or restored from an old tab): use the first.
  useEffect(() => {
    if (runFiles.length > 0 && found < 0) setActiveDoc(runFiles[0].id);
  }, [runFiles, found, setActiveDoc]);
  if (runFiles.length === 0) return null;

  const index = found < 0 ? 0 : found;
  const active = runFiles[index];
  const go = (to: number) => setActiveDoc(runFiles[to].id);

  return (
    <div
      role="group"
      aria-label="Document"
      data-testid="document-switcher"
      className="flex min-w-0 items-center gap-x-1"
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="outline"
            title={active.name}
            aria-label={`Document: ${active.name}, ${index + 1} of ${runFiles.length}`}
            className="max-w-[min(15rem,calc(100vw-7rem))] gap-2 px-2 md:max-w-[11rem] min-[1440px]:max-w-[13.5rem]"
          >
            <span className="truncate font-mono text-small">{active.name}</span>
            <span className="text-small whitespace-nowrap text-ink-muted">
              {index + 1} of {runFiles.length}
            </span>
            <ChevronDown aria-hidden className="text-ink-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(28.75rem,86vw)]">
          {runFiles.map((file) => {
            const current = file.id === active.id;
            return (
              <DropdownMenuItem
                key={file.id}
                aria-current={current ? "true" : undefined}
                className={cn("gap-2.5 px-2.5 py-2", current && "bg-surface-hover")}
                onSelect={() => setActiveDoc(file.id)}
              >
                <span aria-hidden className="w-3.5 shrink-0">
                  {current && <Check className="size-3.5 text-link" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-small">{file.name}</span>
                <StateText state={states[file.id]} />
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 px-2.5 py-2 font-medium text-link"
            onSelect={() => setPicking(true)}
          >
            <Plus aria-hidden />
            Add or remove documents
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous document"
        disabled={index === 0}
        onClick={() => go(index - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next document"
        disabled={index === runFiles.length - 1}
        onClick={() => go(index + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
      <DocumentsSheet open={picking} onOpenChange={setPicking} returnFocusTo={trigger} />
    </div>
  );
}
