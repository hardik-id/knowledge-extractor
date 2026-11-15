"use client";

import { PlaceholderStagePanel } from "../placeholder-stage-panel";

export function ClassifyPanel() {
  return (
    <PlaceholderStagePanel
      stageId="classify"
      comingSoon="Each document will get a type, topic and sensitivity label you can correct here before moving on."
    />
  );
}
