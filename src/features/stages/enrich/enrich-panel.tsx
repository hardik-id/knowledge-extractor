"use client";

import { MarkdownStagePanel } from "../markdown-stage-panel";

export function EnrichPanel() {
  return (
    <MarkdownStagePanel
      stageId="enrich"
      idleTitle="No enriched files yet"
      runningTitle="Enriching files…"
      description={(count) =>
        `Enrich the ${count} classified files. Each file gets a summary, keywords and related documents, added to the same file.`
      }
      runLabel="Run enrichment"
      runningLabel="Enriching…"
      runAgainLabel="Enrich again"
      fileRunningLabel="Enriching"
      noneToShow="No enriched files to show. Enrich the files again."
    />
  );
}
