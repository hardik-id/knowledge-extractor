import type { ComponentType } from "react";
import type { StageId } from "@/types/pipeline";
import { ClassifyPanel } from "./classify/classify-panel";
import { EnrichPanel } from "./enrich/enrich-panel";
import { ExtractPanel } from "./extract/extract-panel";
import { IndexPanel } from "./index/index-panel";
import { IngestPanel } from "./ingest/ingest-panel";
import { SelectPanel } from "./select/select-panel";
import { TransformPanel } from "./transform/transform-panel";

/** Which panel renders in the main area for each stage. Add a stage: add it here and in config.ts. */
export const STAGE_PANELS: Record<StageId, ComponentType> = {
  select: SelectPanel,
  ingest: IngestPanel,
  transform: TransformPanel,
  classify: ClassifyPanel,
  enrich: EnrichPanel,
  extract: ExtractPanel,
  index: IndexPanel,
};
