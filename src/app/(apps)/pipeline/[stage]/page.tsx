import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { STAGE_META } from "@/features/stages/config";
import { STAGE_PANELS } from "@/features/stages/panels";
import { StageGate } from "@/features/stages/stage-gate";
import { STAGE_ORDER, isStageId } from "@/lib/stages";

/** All seven stages are prerendered; any other segment is a 404. */
export function generateStaticParams() {
  return STAGE_ORDER.map((stage) => ({ stage }));
}

export async function generateMetadata({
  params,
}: PageProps<"/pipeline/[stage]">): Promise<Metadata> {
  const { stage } = await params;
  return { title: isStageId(stage) ? STAGE_META[stage].label : "Not found" };
}

export default async function StagePage({ params }: PageProps<"/pipeline/[stage]">) {
  const { stage } = await params;
  if (!isStageId(stage)) notFound();

  const Panel = STAGE_PANELS[stage];
  return (
    <StageGate stageId={stage}>
      <Panel />
    </StageGate>
  );
}
