"use client";

import { MarkdownStagePanel } from "../markdown-stage-panel";

export function ClassifyPanel() {
  return (
    <MarkdownStagePanel
      stageId="classify"
      idleTitle="No classified files yet"
      runningTitle="Classifying files…"
      description={(count) =>
        `Classify the ${count} Markdown files. Each file gets its document type, topic and sensitivity in its front matter.`
      }
      runLabel="Run classification"
      runningLabel="Classifying…"
      runAgainLabel="Classify again"
      fileRunningLabel="Classifying"
      noneToShow="No classified files to show. Classify the files again."
    />
  );
}
