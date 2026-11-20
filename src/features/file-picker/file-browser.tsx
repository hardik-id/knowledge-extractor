"use client";

import { useMemo } from "react";
import { CloudOff, FolderOpen, Search, SearchX, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { SOURCE_LABEL, plural } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import type { SourceKind } from "@/types/pipeline";
import { FileTable } from "./file-table";
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
  // A stored source this app doesn't offer (or a single-source app) falls back to the first.
  const activeSource =
    sources.length > 1 && sources.includes(storedSource) ? storedSource : sources[0];

  return (
    <div className="flex flex-col gap-3">
      <SourcePicker sources={sources} value={activeSource} onChange={setActiveSource} />

      {activeSource === "upload" ? (
        <EmptyState
          icon={Upload}
          title="Upload files"
          description="Drag PDF, Word, Excel or PowerPoint files here. Uploading is not connected yet."
          action={
            <Button variant="secondary" disabled>
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
          searchHint={searchHint}
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
    <p className="text-small font-semibold text-ink" aria-live="polite">
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
  searchHint,
  showSource,
}: {
  source: SourceKind;
  itemNoun: string;
  searchHint: string;
  showSource: boolean;
}) {
  const searchQuery = usePipelineStore((s) => s.searchQuery);
  const query = useDebouncedValue(searchQuery.trim(), SEARCH_DEBOUNCE_MS);
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

  const allShownSelected =
    files !== undefined && files.length > 0 && files.every((f) => selectedIds.includes(f.id));
  const toggleAllShown = () => {
    if (!files) return;
    setSelection(
      allShownSelected
        ? selectedFiles.filter((selected) => !files.some((f) => f.id === selected.id))
        : [...selectedFiles, ...files],
    );
  };

  let body: React.ReactNode;
  if (error) {
    body = (
      <EmptyState
        icon={CloudOff}
        title={`Couldn't load ${itemNoun}s from ${SOURCE_LABEL[source]}`}
        description={describeApiError(error)}
        action={
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        }
      />
    );
  } else if (!files) {
    body = (
      <div aria-busy="true" aria-label={`Loading ${itemNoun}s`} className="space-y-2">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (files.length === 0 && !isLoading) {
    body = query ? (
      <EmptyState
        icon={SearchX}
        title={`No ${itemNoun}s match your search`}
        description={`Nothing in ${SOURCE_LABEL[source]} matches “${query}”. Try a shorter word.`}
        action={
          <Button variant="secondary" onClick={() => setSearchQuery("")}>
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
  } else {
    body = (
      <FileTable
        label={`${capitalize(itemNoun)}s`}
        files={files}
        showSource={showSource}
        selectedIds={selectedIds}
        onToggle={(fileId) => {
          const file = files.find((f) => f.id === fileId);
          if (file) toggleFile(file);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted"
          />
          <Input
            id="file-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchHint}
            aria-label={`Search ${itemNoun}s`}
            className="pl-8"
          />
        </div>
        {files && files.length > 0 && (
          <>
            <p className="text-small text-ink-muted">{plural(files.length, itemNoun)} found</p>
            <Button variant="ghost" size="sm" className="text-link" onClick={toggleAllShown}>
              {allShownSelected ? "Deselect all shown" : "Select all shown"}
            </Button>
          </>
        )}
      </div>
      {/* While a new search is on its way the previous results stay, dimmed. */}
      <div aria-busy={isLoading} className={cn(isLoading && "opacity-60")}>
        {body}
      </div>
    </div>
  );
}
