"use client";

import { useMemo } from "react";
import { labelStyle } from "@/features/extraction/labels";
import { TEXT_START } from "@/lib/dom-selection";
import { segmentText, type Mark } from "@/lib/text-spans";
import { cn } from "@/lib/utils";
import type { FieldMode } from "@/services/contracts";

/** What a highlight knows about the value it shows. */
export interface HighlightData {
  /** Unique per painted span: one value can have several. */
  id: string;
  valueId: string;
  recordId: string;
  fieldId: string;
  /** 1 to 6 */
  labelIndex: number;
  /** The field's name, shown in the chip and read out. */
  name: string;
  mode: FieldMode;
  /** Where the span is in the full text (string indices). */
  start: number;
  end: number;
}

export type HighlightMark = Mark<HighlightData>;

export interface AnnotationProps {
  /** The value that is selected: all of its spans are emphasised. */
  activeValueId?: string | null;
  onMarkClick?: (mark: HighlightData) => void;
}

interface HighlightProps {
  /** Every mark covering this piece, outer ones first. */
  items: HighlightData[];
  /** The marks whose name chip is shown here (their first piece). */
  chipIds: ReadonlySet<string> | readonly string[];
  /** The text of this piece, for the accessible name. */
  label: string;
  activeValueId?: string | null;
  onMarkClick?: (mark: HighlightData) => void;
  children: React.ReactNode;
}

/** The shortest mark wins the colour; among equals, the one listed last (the inner one). */
export function primaryMark(items: HighlightData[]): HighlightData {
  return items.reduce((best, item) =>
    item.end - item.start <= best.end - best.start ? item : best,
  );
}

/**
 * One painted piece of text: a soft background and a 2px underline in the
 * label's colour, a chip with the field's name on the first piece, and a
 * stronger outline when its value is selected. Works as a button: Tab to it,
 * Enter or Space selects it.
 */
export function Highlight({
  items,
  chipIds,
  label,
  activeValueId,
  onMarkClick,
  children,
}: HighlightProps) {
  const primary = primaryMark(items);
  const style = labelStyle(primary.labelIndex);
  const active = activeValueId != null && items.some((item) => item.valueId === activeValueId);
  const chipSet = chipIds instanceof Set ? chipIds : new Set(chipIds);
  const chips = items.filter((item) => chipSet.has(item.id));
  const names = [...new Set(items.map((item) => item.name))];
  // Pressing a piece selects the innermost mark; pressing again moves on to the next one under it.
  const current = items.findIndex((item) => item.valueId === activeValueId);
  const select = () =>
    onMarkClick?.(current >= 0 && items.length > 1 ? items[(current + 1) % items.length] : primary);

  return (
    <mark
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`${names.join(", ")}: ${label}`}
      title={names.length > 1 ? names.join(", ") : primary.name}
      data-value-id={primary.valueId}
      data-start={primary.start}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      className={cn(
        "cursor-pointer rounded-control border-b-2 [box-decoration-break:clone] px-px text-ink",
        style.highlight,
        style.underline,
        active && "border-b-4 outline-2 outline-offset-1 outline-ink-heading",
      )}
    >
      {chips.map((item) => {
        const chip = labelStyle(item.labelIndex);
        return (
          <span
            key={item.id}
            aria-hidden
            className={cn(
              "mr-1 inline-block rounded-pill border px-1.5 align-middle font-sans text-caption font-semibold select-none",
              chip.chip,
            )}
          >
            {item.name}
          </span>
        );
      })}
      {children}
    </mark>
  );
}

interface AnnotatedTextProps extends AnnotationProps {
  /** The full text the marks point into. */
  text: string;
  marks: HighlightMark[];
  className?: string;
}

/**
 * Source view: the text as it is, in a wrapping monospace block, with its
 * marks painted. Each piece of text sits in a span with `data-text-start`
 * (its index in the full text), so a selection can be turned back into indices
 * (lib/dom-selection). Name chips have no such span and never count.
 */
export function AnnotatedText({
  text,
  marks,
  activeValueId,
  onMarkClick,
  className,
}: AnnotatedTextProps) {
  const pieces = useMemo(() => segmentText(text, marks), [text, marks]);
  return (
    <div className={cn("font-mono text-body break-words whitespace-pre-wrap text-ink", className)}>
      {pieces.map((piece) =>
        piece.marks.length === 0 ? (
          <span key={piece.start} {...{ [TEXT_START]: piece.start }}>
            {piece.text}
          </span>
        ) : (
          <Highlight
            key={piece.start}
            items={piece.marks}
            chipIds={piece.marks.filter((m) => m.start === piece.start).map((m) => m.id)}
            label={piece.text}
            activeValueId={activeValueId}
            onMarkClick={onMarkClick}
          >
            <span {...{ [TEXT_START]: piece.start }}>{piece.text}</span>
          </Highlight>
        ),
      )}
    </div>
  );
}
