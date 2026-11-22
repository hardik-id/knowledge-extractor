"use client";

import { SlidersHorizontal } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExtractionRun } from "@/features/extraction/use-extraction-run";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { DocumentPane } from "./document-pane";
import { FieldColumn } from "./field-column";
import { OutputPane } from "./output-pane";
import { RecordStrip } from "./record-strip";
import { WorkspaceProvider } from "./workspace-provider";
import { useScreenControls, WIDE_QUERY } from "./workspace-state";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}

/**
 * The working screen of a project: the document on the left (with the record strip pinned under
 * it), the configuration in a 560px column on the right. Below 1100px the column is a sheet,
 * opened by the "Fields" button above the document. The "Document | Output" switch is in the top bar.
 */
export function OneScreen({ extraction }: { extraction: ExtractionRun }) {
  const { definition } = extraction;
  const { saved, draft } = definition;
  const fileId = usePipelineStore(
    (s) => s.runFiles.find((f) => f.id === s.activeDocId)?.id ?? s.runFiles[0]?.id ?? null,
  );

  if (definition.error) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-6">
        <p>
          <span className="font-semibold text-ink">Couldn&apos;t load the {extraction.noun}.</span>{" "}
          {describeApiError(definition.error, extraction.noun)}
        </p>
        <Button variant="outline" size="sm" onClick={definition.retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (definition.isLoading || !saved || !draft) {
    return (
      <div aria-busy="true" aria-label="Loading configuration" className="space-y-3 px-4 py-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    // Keyed by the document: opening another one starts with nothing selected.
    <WorkspaceProvider key={fileId ?? "none"} fileId={fileId} recordTypes={draft.recordTypes}>
      <Screen extraction={extraction} fileId={fileId} />
    </WorkspaceProvider>
  );
}

function Screen({ extraction, fileId }: { extraction: ExtractionRun; fileId: string | null }) {
  const { definition } = extraction;
  const wide = useWide();
  const controls = useScreenControls();
  const view = controls?.view ?? "document";
  const fieldsOpen = controls?.fieldsOpen ?? false;
  const setFieldsOpen = controls?.setFieldsOpen ?? (() => {});
  const fieldsButton = useRef<HTMLButtonElement>(null);
  // Nothing to show as output while there is nothing to extract.
  const configured = (definition.draft?.recordTypes.length ?? 0) > 0;
  const shown = configured ? view : "document";

  return (
    <div className="flex flex-1 md:min-h-0">
      <main
        id="working-screen"
        aria-label="Document"
        className="flex min-w-0 flex-1 flex-col md:min-h-0"
      >
        {!wide && (
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-1.5">
            <Button
              ref={fieldsButton}
              variant="outline"
              size="sm"
              onClick={() => setFieldsOpen(true)}
            >
              <SlidersHorizontal data-icon="inline-start" />
              Fields
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 md:overflow-y-auto">
          {!fileId ? (
            <p className="px-6 py-6 text-ink-muted">Nothing to show yet.</p>
          ) : shown === "output" ? (
            <OutputPane fileId={fileId} definition={definition} />
          ) : (
            <DocumentPane fileId={fileId} definition={definition} />
          )}
        </div>
        <div className="sticky bottom-0 shrink-0 md:static">
          <RecordStrip definition={definition} />
        </div>
      </main>
      {wide ? (
        <aside
          aria-label="Fields"
          className="flex min-h-0 min-w-[480px] flex-[0_1_560px] flex-col border-l border-border-subtle"
        >
          <FieldColumn definition={definition} />
        </aside>
      ) : (
        <Sheet open={fieldsOpen} onOpenChange={setFieldsOpen}>
          <SheetContent
            aria-label="Fields"
            onOpenAutoFocus={(event) => {
              // Opening focuses the sheet itself, not the first field's name (no keyboard, no accidental overwrite).
              event.preventDefault();
              if (event.target instanceof HTMLElement) event.target.focus();
            }}
            onCloseAutoFocus={(event) => {
              // Closing returns focus to the button that opened it.
              event.preventDefault();
              fieldsButton.current?.focus();
            }}
            className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]"
          >
            <SheetHeader className="border-b border-border-subtle py-2 pr-12 pl-4">
              <SheetTitle>Fields</SheetTitle>
              <SheetDescription className="sr-only">
                What to extract and the fields of each record.
              </SheetDescription>
            </SheetHeader>
            <FieldColumn definition={definition} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
