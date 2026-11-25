"use client";

import { ChevronDown, ChevronRight, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { customIsStale, setCustomChunking } from "@/features/extraction/definition-draft";
import { Problem } from "@/features/extraction/field-table";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { isSessionEnd } from "@/features/auth/report-failure";
import { services } from "@/services";
import {
  CUSTOM_INSTRUCTION_MAX,
  CUSTOM_SOURCE_URL_MAX,
  type CustomChunking,
  type CustomChunkingDocument,
  type CustomChunkingResult,
} from "@/services/contracts";
import {
  PARTS_SHOWN,
  resultAnnouncement,
  type CustomWords,
  STALE_HINT,
  STALE_SIZE_HINT,
  generateSplitter,
  partSize,
  partsLabel,
} from "./custom-chunking";

type Generation =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string }
  | {
      status: "done";
      result: CustomChunkingResult;
      /** What the code was written from: this, not the boxes as they are now, is applied. */
      request: { instruction: string; sourceUrl: string | null; size: number };
    };

/**
 * The Custom part of the Chunking row: the description, the link, Generate, what came back and
 * what is applied. Mount it with `key={runId}`: a project change then abandons a running call.
 */
export function CustomChunkingPanel({
  definition,
  runId,
  words,
  setWords,
  sizeProblem,
  sizeControl,
}: {
  definition: ExtractionDefinitionState;
  runId: string;
  words: CustomWords | null;
  setWords: (words: CustomWords) => void;
  sizeProblem: string;
  /** The row's size box, shown between the link and Generate. */
  sizeControl: React.ReactNode;
}) {
  const { draft, setDraft } = definition;
  const id = useId();
  const [generation, setGeneration] = useState<Generation>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  const generateButton = useRef<HTMLButtonElement>(null);
  const appliedText = useRef<HTMLParagraphElement>(null);
  // Where focus goes once the result is gone (Apply or Discard): the element is there next render.
  const focusAfter = useRef<"applied" | "generate" | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target) (target === "applied" ? appliedText.current : generateButton.current)?.focus();
  });

  // Leaving the project, or the row, abandons the call: its answer goes nowhere.
  useEffect(() => () => controller.current?.abort(), []);

  if (!draft) return null;
  const applied = draft.chunking.custom ?? null;
  const size = draft.chunking.size;
  const appliedCode = applied?.code ?? null;
  const kept = words && words.forCode === appliedCode ? words : null;
  const instruction = kept?.instruction ?? applied?.instruction ?? "";
  const sourceUrl = kept?.sourceUrl ?? applied?.sourceUrl ?? "";
  const change = (next: Partial<Pick<CustomWords, "instruction" | "sourceUrl">>) =>
    setWords({ instruction, sourceUrl, ...next, forCode: appliedCode });

  const running = generation.status === "running";
  const sizeOk = !sizeProblem && size != null;
  const canGenerate = instruction.trim() !== "" && !running && sizeOk;
  const stale = customIsStale(applied, instruction, sourceUrl);

  const generate = async () => {
    if (!canGenerate || size == null) return;
    const request = { instruction: instruction.trim(), sourceUrl: sourceUrl.trim() || null, size };
    controller.current?.abort();
    const call = new AbortController();
    controller.current = call;
    setGeneration({ status: "running" });
    const outcome = await generateSplitter(
      services.extraction,
      runId,
      request,
      call.signal,
      isSessionEnd,
    );
    if (outcome.kind === "abandoned") {
      // A newer call or an unmount took over; a session end only stops the wait.
      if (controller.current === call) setGeneration({ status: "idle" });
      return;
    }
    controller.current = null;
    setGeneration(
      outcome.kind === "result"
        ? { status: "done", result: outcome.result, request }
        : { status: "error", message: outcome.message },
    );
  };

  const apply = () => {
    if (generation.status !== "done") return;
    const { result, request } = generation;
    const custom: CustomChunking = {
      instruction: request.instruction,
      sourceUrl: request.sourceUrl,
      code: result.code,
      summary: result.summary,
    };
    setDraft((d) => setCustomChunking(d, custom));
    setGeneration({ status: "idle" });
    focusAfter.current = "applied";
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-instruction`} className="text-small font-normal text-ink-muted">
          Describe how to split
        </Label>
        <Textarea
          id={`${id}-instruction`}
          value={instruction}
          maxLength={CUSTOM_INSTRUCTION_MAX}
          required
          rows={3}
          placeholder="For example: split at every level-2 heading, keep tables whole"
          onChange={(e) => change({ instruction: e.target.value })}
        />
        <span className="text-caption text-ink-muted">
          {instruction.length} of {CUSTOM_INSTRUCTION_MAX} characters
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-url`} className="text-small font-normal text-ink-muted">
          Reference link (optional)
        </Label>
        <Input
          id={`${id}-url`}
          type="url"
          value={sourceUrl}
          maxLength={CUSTOM_SOURCE_URL_MAX}
          placeholder="https://"
          onChange={(e) => change({ sourceUrl: e.target.value })}
        />
      </div>
      {sizeControl}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={generateButton}
          type="button"
          variant="secondary"
          disabled={!canGenerate}
          aria-disabled={!canGenerate}
          onClick={generate}
        >
          {running && <LoaderCircle aria-hidden className="animate-spin" />}
          Generate
        </Button>
        <span role="status" className="text-small text-ink-muted">
          {running
            ? "Writing and testing the splitting code… this can take a minute"
            : generation.status === "done"
              ? resultAnnouncement(generation.result.documents.length)
              : ""}
        </span>
      </div>

      {generation.status === "error" && (
        <div role="alert">
          <Problem id={`${id}-generate-err`}>{generation.message}</Problem>
        </div>
      )}

      {generation.status === "done" && (
        <GeneratedResult
          result={generation.result}
          stale={customIsStale(
            {
              instruction: generation.request.instruction,
              sourceUrl: generation.request.sourceUrl,
              code: "",
              summary: "",
            },
            instruction,
            sourceUrl,
          )}
          sizeChanged={generation.request.size !== size}
          onApply={apply}
          onDiscard={() => {
            setGeneration({ status: "idle" });
            focusAfter.current = "generate";
          }}
        />
      )}

      {applied && generation.status !== "done" && (
        <div className="flex flex-col gap-1">
          <p
            ref={appliedText}
            tabIndex={-1}
            className="flex gap-1 text-small text-ink outline-offset-2"
          >
            <CircleCheck aria-hidden className="mt-px size-4 shrink-0 text-success" />
            <span>
              <span className="font-medium">Applied.</span> {applied.summary}
            </span>
          </p>
          <ViewCode code={applied.code} />
          {stale && <p className="text-small text-ink-muted">{STALE_HINT} Run Generate again.</p>}
        </div>
      )}
    </div>
  );
}

function GeneratedResult({
  result,
  stale,
  sizeChanged,
  onApply,
  onDiscard,
}: {
  result: CustomChunkingResult;
  stale: boolean;
  sizeChanged: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
      <p className="text-body text-ink">{result.summary}</p>
      {result.documents.length === 0 ? (
        <p className="text-small text-ink-muted">No document to show the parts of.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Documents checked">
          {result.documents.map((doc) => (
            <li key={doc.fileId}>
              <DocumentParts doc={doc} />
            </li>
          ))}
        </ul>
      )}
      <ViewCode code={result.code} />
      {stale && <p className="text-small text-ink-muted">{STALE_HINT} Run Generate again.</p>}
      {sizeChanged && <p className="text-small text-ink-muted">{STALE_SIZE_HINT}</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={onApply}>
          Apply
        </Button>
        <Button type="button" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function DocumentParts({ doc }: { doc: CustomChunkingDocument }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-parts`}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 rounded-control py-1 text-left text-small hover:bg-surface-hover"
      >
        <Chevron aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate text-ink">{doc.name}</span>
        <span className="whitespace-nowrap text-ink-muted">{partsLabel(doc.parts.length)}</span>
      </button>
      <ol
        id={`${id}-parts`}
        hidden={!open}
        aria-label={`Parts of ${doc.name}`}
        className="ml-5 max-h-48 overflow-y-auto"
      >
        {doc.parts.slice(0, PARTS_SHOWN).map((part, i) => (
          <li key={i} className="flex gap-2 py-0.5 text-caption">
            <span className="min-w-0 flex-1 truncate text-ink">{part.startsWith}</span>
            <span className="whitespace-nowrap text-ink-muted">{partSize(part)} characters</span>
          </li>
        ))}
        {doc.parts.length > PARTS_SHOWN && (
          <li className="py-0.5 text-caption text-ink-muted">
            and {doc.parts.length - PARTS_SHOWN} more
          </li>
        )}
      </ol>
    </div>
  );
}

function ViewCode({ code }: { code: string }) {
  return (
    <details className="text-small">
      <summary className="cursor-pointer rounded-control py-1 text-link">View code</summary>
      <pre
        tabIndex={0}
        aria-label="Splitting code, read only"
        className="max-h-64 overflow-auto rounded-control border border-border-subtle bg-surface-tint p-2 font-mono text-caption whitespace-pre text-ink"
      >
        <code>{code}</code>
      </pre>
    </details>
  );
}
