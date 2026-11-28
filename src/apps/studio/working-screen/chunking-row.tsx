"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { usePipelineStore } from "@/store/pipeline-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  CHUNKING_LABELS,
  chunkingSummary,
  parseChunkSize,
  setChunkingSize,
  chooseChunkingStrategy,
} from "@/features/extraction/definition-draft";
import { Problem } from "@/features/extraction/field-table";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import {
  CHUNKING_STRATEGIES,
  CHUNK_SIZE_MAX,
  CHUNK_SIZE_MIN,
  type ChunkingStrategy,
} from "@/services/contracts";
import { CustomChunkingPanel } from "./custom-chunking-panel";
import { NO_MEMORY, memoryFor, rememberApplied, rememberWords } from "./custom-chunking";
import { useScreenControls } from "./screen-state";

/**
 * "Chunking" on one line under "What to extract": how the documents are cut into pieces before
 * extraction. The header is a button; closed it says what is chosen ("Automatic", "By paragraph,
 * 4000 characters"), open it holds the strategy and, unless it is automatic, the size. Changes go
 * into the draft like any other. Hidden with the prompt line: while there is nothing to extract yet.
 */
export function ChunkingRow({
  definition,
  readOnly = false,
}: {
  definition: ExtractionDefinitionState;
  /** Without the right to edit: the line as text, nothing to open. */
  readOnly?: boolean;
}) {
  const { draft, setDraft, errors, showErrors, chunkingProblem } = definition;
  const controls = useScreenControls();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controls ? controls.chunkingOpen : localOpen;
  const setOpen = controls ? controls.setChunkingOpen : setLocalOpen;
  const id = useId();
  // What the size box shows while it is being typed in: "1500.5" or "" are not sizes, yet they stay.
  const [typed, setTyped] = useState<string | null>(null);
  // The description and link typed for Custom: kept while the screen is open, not saved.
  const [memory, setMemory] = useState(NO_MEMORY);
  const runId = usePipelineStore((s) => s.runId);
  // Tied to the run: another workspace starts with nothing remembered.
  const remembered = memoryFor(memory, runId);

  // A size that is wrong when the person tries to save or run, or that the server refused: open
  // the row, the problem is in it.
  const mustShow = (showErrors && (!!errors.chunkSize || !!errors.chunkCode)) || !!chunkingProblem;
  useEffect(() => {
    if (mustShow) setOpen(true);
  }, [mustShow, setOpen]);

  if (!draft) return null;
  if (!draft.prompt.trim() && draft.recordTypes.length === 0) return null;

  if (readOnly) {
    return (
      <div className="flex items-center gap-2 border-b border-border-subtle py-1.5 pr-3 pl-4">
        <span className="text-small whitespace-nowrap text-ink-muted">Chunking</span>
        <span className="min-w-0 flex-1 truncate">{chunkingSummary(draft.chunking)}</span>
      </div>
    );
  }

  const { strategy, size } = draft.chunking;
  const problem = chunkingProblem || errors.chunkSize;
  const codeProblem = strategy === "custom" && showErrors ? errors.chunkCode : undefined;
  const shownSize = typed !== null && parseChunkSize(typed) === size ? typed : (size ?? "");
  const Chevron = open ? ChevronDown : ChevronRight;

  const sizeControl = (
    <>
      <Label htmlFor={`${id}-size`} className="text-small font-normal text-ink-muted">
        Size
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`${id}-size`}
          type="number"
          inputMode="numeric"
          step={1}
          min={CHUNK_SIZE_MIN}
          max={CHUNK_SIZE_MAX}
          value={shownSize}
          className="w-28"
          aria-invalid={!!problem}
          aria-describedby={problem ? `${id}-size-err` : undefined}
          onChange={(e) => {
            setTyped(e.target.value);
            const next = parseChunkSize(e.target.value);
            setDraft((d) => setChunkingSize(d, next));
          }}
        />
        <span className="text-small whitespace-nowrap text-ink-muted">characters</span>
      </div>
    </>
  );

  return (
    <div className="border-b border-border-subtle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-1.5 pr-3 pl-4 text-left hover:bg-surface-hover"
      >
        <span className="text-small whitespace-nowrap text-ink-muted">Chunking</span>
        <span className="min-w-0 flex-1 truncate">{chunkingSummary(draft.chunking)}</span>
        <Chevron aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
      </button>
      <div id={`${id}-panel`} hidden={!open} className="pr-3 pb-2 pl-4">
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
          <Label htmlFor={`${id}-strategy`} className="text-small font-normal text-ink-muted">
            Strategy
          </Label>
          <Select
            id={`${id}-strategy`}
            value={strategy}
            className="max-w-56"
            onChange={(e) => {
              setTyped(null);
              const next = e.target.value as ChunkingStrategy;
              const leaving = draft.chunking.custom;
              if (strategy === "custom" && next !== "custom" && leaving) {
                setMemory(rememberApplied(memory, runId, leaving));
              }
              setDraft((d) => chooseChunkingStrategy(d, next, remembered.applied));
            }}
          >
            {CHUNKING_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {CHUNKING_LABELS[s]}
              </option>
            ))}
          </Select>
          {strategy !== "auto" && strategy !== "custom" && sizeControl}
        </div>
        {strategy === "custom" && runId && (
          <CustomChunkingPanel
            key={runId}
            definition={definition}
            runId={runId}
            words={remembered.words}
            setWords={(w) => setMemory(rememberWords(memory, runId, w))}
            sizeProblem={problem ?? ""}
            sizeControl={
              <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-2">
                {sizeControl}
              </div>
            }
          />
        )}
        {codeProblem && (
          <div role="alert">
            <Problem id={`${id}-code-err`}>{codeProblem}</Problem>
          </div>
        )}
        {problem && strategy !== "auto" && (
          <div role="alert">
            <Problem id={`${id}-size-err`}>{problem}</Problem>
          </div>
        )}
      </div>
    </div>
  );
}
