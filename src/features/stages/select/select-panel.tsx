"use client";

import { StagePanel } from "@/components/pipeline/stage-panel";
import { FileBrowser, SelectionSummary } from "@/features/file-picker/file-browser";

export function SelectPanel() {
  return (
    <StagePanel stageId="select" status={<SelectionSummary itemNoun="file" />}>
      <FileBrowser
        sources={["confluence", "sharepoint", "upload"]}
        itemNoun="file"
        searchHint="Search by name or space"
      />
    </StagePanel>
  );
}
