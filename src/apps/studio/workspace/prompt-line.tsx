"use client";

import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";

/** A stub until item 8: "What to extract" on one line, truncated and read-only. */
export function PromptLine({ definition }: { definition: ExtractionDefinitionState }) {
  const prompt = definition.draft?.prompt.trim();
  if (!prompt) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle py-1.5 pr-3 pl-4">
      <span className="text-small whitespace-nowrap text-ink-muted">What to extract</span>
      <span className="min-w-0 flex-1 truncate" title={prompt}>
        {prompt}
      </span>
    </div>
  );
}
