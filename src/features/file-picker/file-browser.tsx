"use client";

import { useMemo } from "react";
import { CloudOff, FolderOpen, Search, SearchX, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { FileList } from "@/components/pipeline/file-list";
import { SOURCE_LABEL, plural } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import type { SourceKind } from "@/types/pipeline";
import { SourcePicker } from "./source-picker";

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Wait this long after the last keystroke before asking the catalog. */
const SEARCH_DEBOUNCE_MS = 250;

interface FileBrowserProps {
  /** The sources to offer, in tab order. One source shows no tabs and is always the one used. */
  sources: readonly SourceKind[];
  /** What a listed item is called, singular: "file", "document". */
  itemNoun: string;
  searchHint: string;
}

/** Source tabs, search and the selectable list. The selection lives in the store. */
export function FileBrowser({ sources, itemNoun, searchHint }: FileBrowserProps) {
  const storedSource = usePipelineStore((s) => s.activeSource);
  const setActiveSource = usePipelineStore((s) => s.setActiveSource);
  const searchQuery = usePipelineStore((s) => s.searchQuery);
  const setSearchQuery = usePipelineStore((s) => s.setSearchQuery);
  // A stored source this app doesn't offer (or a single-source app) falls back to the first.
  const activeSource =
    sources.length > 1 && sources.includes(storedSource) ? storedSource : sources[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SourcePicker sources={sources} value={activeSource} onChange={setActiveSource} />
        {activeSource !== "upload" && (
          <div className="relative w-full sm:max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            />
            <Input
              id="file-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchHint}
              aria-label={`Search ${itemNoun}s`}
              className="h-11 pl-9"
            />
          </div>
        )}
      </div>

      {activeSource === "upload" ? (
        <EmptyState
          icon={Upload}
          title="Upload files"
          description="Drag PDF, Word, Excel or PowerPoint files here. Uploading is not connected yet."
          action={
            <Button variant="outline" disabled>
              Choose files
            </Button>
          }
        />
      ) : (
        // Keyed by source, so one source's results are never shown under another.
        <CatalogFiles
          key={activeSource}
          source={activeSource}
          itemNoun={itemNoun}
          showSource={sources.length > 1}
        />
      )}
    </div>
  );
}

/** "N files selected" with a Clear link, for a stage's status slot or a toolbar. */
export function SelectionSummary({ itemNoun }: { itemNoun: string }) {
  const selectedCount = usePipelineStore((s) => s.selectedFiles.length);
  const clearSelection = usePipelineStore((s) => s.clearSelection);
  return (
    <p className="font-semibold text-ink" aria-live="polite">
      {plural(selectedCount, itemNoun)} selected
      {selectedCount > 0 && (
        <Button variant="link" size="sm" onClick={clearSelection} className="ml-2 h-auto px-0">
          Clear
        </Button>
      )}
    </p>
  );
}

/** The files of one source that match the search, with their loading, error and empty states. */
function CatalogFiles({
  source,
  itemNoun,
  showSource,
}: {
  source: SourceKind;
  itemNoun: string;
  showSource: boolean;
}) {
  const query = useDebouncedValue(
    usePipelineStore((s) => s.searchQuery).trim(),
    SEARCH_DEBOUNCE_MS,
  );
  const setSearchQuery = usePipelineStore((s) => s.setSearchQuery);
  const selectedFiles = usePipelineStore((s) => s.selectedFiles);
  const toggleFile = usePipelineStore((s) => s.toggleFile);
  const setSelection = usePipelineStore((s) => s.setSelection);

  const {
    data: files,
    error,
    isLoading,
    retry,
  } = useAsyncData(JSON.stringify([source, query]), (signal) =>
    services.catalog.list(source, query, signal),
  );
  const selectedIds = useMemo(() => selectedFiles.map((f) => f.id), [selectedFiles]);

  if (error) {
    return (
      <EmptyState
        icon={CloudOff}
        title={`Couldn't load ${itemNoun}s from ${SOURCE_LABEL[source]}`}
        description={describeApiError(error)}
        action={
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!files) {
    return (
      <div aria-busy="true" aria-label={`Loading ${itemNoun}s`} className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (files.length === 0 && !isLoading) {
    return query ? (
      <EmptyState
        icon={SearchX}
        title={`No ${itemNoun}s match your search`}
        description={`Nothing in ${SOURCE_LABEL[source]} matches “${query}”. Try a shorter word.`}
        action={
          <Button variant="outline" onClick={() => setSearchQuery("")}>
            Clear search
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={FolderOpen}
        title={`No ${itemNoun}s in ${SOURCE_LABEL[source]}`}
        description={`${capitalize(itemNoun)}s you have access to in this source will be listed here.`}
      />
    );
  }

  const allShownSelected = files.length > 0 && files.every((f) => selectedIds.includes(f.id));
  const toggleAllShown = () =>
    setSelection(
      allShownSelected
        ? selectedFiles.filter((selected) => !files.some((f) => f.id === selected.id))
        : [...selectedFiles, ...files],
    );

  return (
    // While a new search is on its way the previous results stay, dimmed.
    <div aria-busy={isLoading} className={cn("flex flex-col gap-4", isLoading && "opacity-60")}>
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-ink-muted">{plural(files.length, itemNoun)} found</p>
        <Button variant="link" size="sm" className="px-0" onClick={toggleAllShown}>
          {allShownSelected ? "Deselect all shown" : "Select all shown"}
        </Button>
      </div>
      <FileList
        label={`${capitalize(itemNoun)}s`}
        files={files}
        showSource={showSource}
        selectedIds={selectedIds}
        onToggle={(fileId) => {
          const file = files.find((f) => f.id === fileId);
          if (file) toggleFile(file);
        }}
      />
    </div>
  );
}
