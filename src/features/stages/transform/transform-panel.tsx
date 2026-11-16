"use client";

import { MarkdownStagePanel } from "../markdown-stage-panel";

export function TransformPanel() {
  return (
    <MarkdownStagePanel
      stageId="transform"
      idleTitle="No Markdown files yet"
      runningTitle="Converting files…"
      description={(count) =>
        `Convert the ${count} downloaded files to Markdown to review them here.`
      }
      runLabel="Convert to Markdown"
      runningLabel="Converting…"
      runAgainLabel="Convert again"
      fileRunningLabel="Converting"
      noneToShow="No Markdown to show. Convert the files again."
    />
  );
}
