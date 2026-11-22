"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeApiError } from "@/services/errors";
import { DefineTab } from "./define-tab";
import { OutputTab } from "./output-tab";
import { ReviewTab } from "./review-tab";
import type { ExtractionRun, ExtractionTab } from "./use-extraction-run";

interface ExtractionWorkspaceProps {
  extraction: ExtractionRun;
  /** Opening line of the Define tab. */
  definitionNote: string;
  /** The Studio page: the version, its history and Templates are in the page header, not here. */
  versioned?: boolean;
}

/** The Define, Review and Output tabs, with the loading and error states of the definition. */
export function ExtractionWorkspace({
  extraction,
  definitionNote,
  versioned = false,
}: ExtractionWorkspaceProps) {
  const { definition, tab, setTab, noun } = extraction;
  const { saved } = definition;

  if (definition.error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>
          <span className="font-semibold text-ink">Couldn&apos;t load the {noun}.</span>{" "}
          {describeApiError(definition.error, noun)}
        </p>
        <Button variant="outline" size="sm" onClick={definition.retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (definition.isLoading || !saved) {
    return (
      <div role="status" aria-busy="true" aria-label={`Loading ${noun}`} className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab?.(v as ExtractionTab)} className="gap-5">
        <TabsList variant="line" aria-label="Extraction">
          <TabsTrigger value="define">Define</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
        </TabsList>
        <TabsContent value="define">
          <DefineTab
            definition={definition}
            definitionNote={definitionNote}
            showSave={!versioned}
            showTemplates={!versioned}
            showUnsavedBar={!versioned}
          />
        </TabsContent>
        <TabsContent value="review">
          <ReviewTab definition={saved} />
        </TabsContent>
        <TabsContent value="output">
          <OutputTab definition={saved} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
