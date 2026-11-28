"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";

/**
 * "What to extract" on one line, truncated. A click turns it into a text box; Esc or leaving it
 * closes the box. What is typed goes into the draft as it is typed. Hidden while there is nothing
 * to extract yet (no prompt and no record type): the empty screen asks for it instead.
 */
export function PromptLine({
  definition,
  readOnly = false,
}: {
  definition: ExtractionDefinitionState;
  /** Without the right to edit: the text as it is, no button and no box. */
  readOnly?: boolean;
}) {
  const { draft, setDraft } = definition;
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // Set by Esc: the focus goes back to the button. Not by a blur, which went somewhere else.
  const returnFocus = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!editing) {
      if (returnFocus.current) opener.current?.focus();
      returnFocus.current = false;
      return;
    }
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  if (!draft) return null;
  const prompt = draft.prompt.trim();
  if (!editing && !prompt && draft.recordTypes.length === 0) return null;

  if (readOnly) {
    if (!prompt) return null;
    return (
      <div className="flex items-baseline gap-2 border-b border-border-subtle py-1.5 pr-3 pl-4">
        <span className="text-small whitespace-nowrap text-ink-muted">What to extract</span>
        <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{prompt}</span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 border-b border-border-subtle py-1.5 pr-3 pl-4">
        <label htmlFor="prompt-line-box" className="text-small text-ink-muted">
          What to extract
        </label>
        <Textarea
          id="prompt-line-box"
          ref={box}
          rows={3}
          value={draft.prompt}
          onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            // Closes the box, nothing else (not the field selection, not the overlay).
            event.preventDefault();
            event.stopPropagation();
            returnFocus.current = true;
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <button
      ref={opener}
      type="button"
      onClick={() => setEditing(true)}
      className="flex w-full items-center gap-2 border-b border-border-subtle py-1.5 pr-3 pl-4 text-left hover:bg-surface-hover"
    >
      <span className="text-small whitespace-nowrap text-ink-muted">What to extract</span>
      <span className="min-w-0 flex-1 truncate" title={prompt || undefined}>
        {prompt || <span className="text-ink-muted">Describe what to extract</span>}
      </span>
      <Pencil aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
    </button>
  );
}
