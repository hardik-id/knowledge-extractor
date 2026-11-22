"use client";

import { ArrowLeft, History } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { plural } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { DefinitionVersionSummary, ExtractionDefinition } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { formatSavedDate, versionLine } from "./version-format";
import type { ExtractionDefinitionState } from "./use-extraction-definition";

/**
 * The version of the configuration, "Unsaved changes" when the draft differs, and Version
 * history: inline, for the facts line of the page header.
 */
export function VersionBar({
  definition,
  emptyIsUnsaved = false,
}: {
  definition: ExtractionDefinitionState;
  /** A configuration with no record type reads "Nothing saved yet" (the Studio). */
  emptyIsUnsaved?: boolean;
}) {
  const { saved, dirty } = definition;
  const [open, setOpen] = useState(false);
  if (!saved) return null;
  return (
    <>
      <p>
        <span data-testid="version-line">
          {emptyIsUnsaved && saved.recordTypes.length === 0
            ? "Nothing saved yet"
            : versionLine(saved.version, saved.createdAt)}
        </span>
        {dirty && (
          <>
            {" · "}
            <span className="font-semibold text-ink">Unsaved changes</span>
          </>
        )}
      </p>
      <Button
        variant="link"
        size="sm"
        className="h-auto px-0 no-underline hover:underline"
        onClick={() => setOpen(true)}
      >
        <History data-icon="inline-start" aria-hidden />
        Version history
      </Button>
      {open && <HistoryDialog definition={definition} onClose={() => setOpen(false)} />}
    </>
  );
}

function HistoryDialog({
  definition,
  onClose,
}: {
  definition: ExtractionDefinitionState;
  onClose: () => void;
}) {
  const runId = usePipelineStore((s) => s.runId);
  const latest = definition.saved?.version ?? 0;
  const [viewing, setViewing] = useState<number | null>(null);

  const list = useAsyncData(runId ? `${runId}:${latest}` : null, (signal) =>
    services.extraction.listDefinitionVersions(runId!, signal),
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Every saved version of this extraction configuration, newest first.
          </DialogDescription>
        </DialogHeader>
        {viewing !== null && runId ? (
          <VersionView
            runId={runId}
            version={viewing}
            isLatest={viewing === latest}
            definition={definition}
            onBack={() => setViewing(null)}
            onRestored={onClose}
          />
        ) : (
          <VersionList
            versions={list.data}
            loading={list.isLoading}
            error={list.error}
            retry={list.retry}
            latest={latest}
            onView={setViewing}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function VersionList({
  versions,
  loading,
  error,
  retry,
  latest,
  onView,
}: {
  versions: DefinitionVersionSummary[] | undefined;
  loading: boolean;
  error: unknown;
  retry: () => void;
  latest: number;
  onView: (version: number) => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>
          <span className="font-semibold text-ink">Couldn&apos;t load the versions.</span>{" "}
          {describeApiError(error, "configuration")}
        </p>
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!versions || loading) {
    return (
      <div aria-busy="true" aria-label="Loading versions" className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  return (
    <ul aria-label="Versions" className="flex flex-col divide-y divide-border-subtle">
      {versions.map((v) => (
        <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-ink">
              Version {v.version}
              {v.version === latest && (
                <span className="font-normal text-ink-muted"> (latest)</span>
              )}
              <span className="font-normal text-ink-muted"> · {formatSavedDate(v.createdAt)}</span>
            </p>
            <p className="text-body text-ink-muted">
              {plural(v.recordTypeCount, "record type")}, {plural(v.fieldCount, "field")}
            </p>
            {v.note && <p className="text-body break-words text-ink">{v.note}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => onView(v.version)}>
            View version {v.version}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function VersionView({
  runId,
  version,
  isLatest,
  definition,
  onBack,
  onRestored,
}: {
  runId: string;
  version: number;
  isLatest: boolean;
  definition: ExtractionDefinitionState;
  onBack: () => void;
  onRestored: () => void;
}) {
  const { data, error, isLoading, retry } = useAsyncData(`${runId}:v${version}`, (signal) =>
    services.extraction.getDefinitionVersion(runId, version, signal),
  );
  const [confirming, setConfirming] = useState(false);

  const restore = async () => {
    const result = await definition.restore(version);
    if (result) onRestored();
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" aria-hidden />
        All versions
      </Button>
      {error ? (
        <div className="flex flex-col items-start gap-3">
          <p>
            <span className="font-semibold text-ink">Couldn&apos;t load this version.</span>{" "}
            {describeApiError(error, "configuration")}
          </p>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : !data || isLoading ? (
        <Skeleton aria-busy="true" aria-label="Loading version" className="h-40 w-full" />
      ) : (
        <ReadOnlyVersion version={data} />
      )}
      {data && !isLatest && (
        <div className="space-y-3 border-t border-border-subtle pt-4">
          {confirming && (
            <p role="alert" className="text-body text-ink">
              You have unsaved changes. Restoring replaces them with version {version}.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={definition.saving}
              onClick={() => {
                if (definition.dirty && !confirming) setConfirming(true);
                else void restore();
              }}
            >
              {confirming ? "Discard changes and restore" : "Restore this version"}
            </Button>
            {confirming && (
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Keep my changes
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlyVersion({ version }: { version: ExtractionDefinition }) {
  return (
    <div className="space-y-4" data-testid="version-readonly">
      <p className="text-body text-ink-muted">
        {versionLine(version.version, version.createdAt)}. Read only.
        {version.note && <> Note: {version.note}</>}
      </p>
      <section className="space-y-1">
        <h3 className="font-semibold text-ink">What to extract</h3>
        <p className="whitespace-pre-wrap text-ink">{version.prompt || "Nothing written."}</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold text-ink">Record types</h3>
        {version.recordTypes.length === 0 && <p className="text-ink-muted">None.</p>}
        {version.recordTypes.map((t) => (
          <div key={t.id} className="rounded-panel border border-border-subtle p-3">
            <p className="font-semibold text-ink">{t.name || "Unnamed"}</p>
            {t.description && <p className="text-body text-ink-muted">{t.description}</p>}
            {t.fields.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-body text-ink">
                {t.fields.map((f) => (
                  <li key={f.id}>
                    {f.name || f.key}{" "}
                    <span className="text-ink-muted">
                      ({f.mode === "quote" ? "exact quote" : "inferred"}, {f.valueType}
                      {f.multiple ? ", several values" : ""})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
      <section className="space-y-1">
        <h3 className="font-semibold text-ink">Output</h3>
        <p className="text-ink">Format: {version.output.format}</p>
      </section>
    </div>
  );
}
