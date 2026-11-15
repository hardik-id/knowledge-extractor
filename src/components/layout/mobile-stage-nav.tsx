"use client";

import { useState } from "react";
import { ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { STAGE_META } from "@/features/stages/config";
import { STAGE_ORDER, stageIndex } from "@/lib/stages";
import { StageSidebar } from "./stage-sidebar";
import { useCurrentStage } from "./use-current-stage";

/** Below 960px: "Stage 3 of 7 · Transform" button that opens the stage list in a sheet. */
export function MobileStageNav() {
  const [open, setOpen] = useState(false);
  const current = useCurrentStage();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="md:hidden">
          <ListOrdered data-icon="inline-start" />
          {current ? (
            <span>
              <span className="font-normal text-ink-muted">
                {stageIndex(current) + 1}/{STAGE_ORDER.length}
              </span>{" "}
              {STAGE_META[current].label}
            </span>
          ) : (
            "Stages"
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(20rem,88vw)] bg-surface-tint p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Pipeline stages</SheetTitle>
          <SheetDescription>Open a stage of the current run.</SheetDescription>
        </SheetHeader>
        <StageSidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
