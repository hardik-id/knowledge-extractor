"use client";

import { LayoutTemplate, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TemplateDialog } from "@/features/extraction/template-dialog";
import type { ExtractionRun } from "@/features/extraction/use-extraction-run";

/** The "more" menu of the top bar: Templates, which opens its dialog. */
export function MoreMenu({ extraction }: { extraction: ExtractionRun }) {
  const [templates, setTemplates] = useState(false);
  if (!extraction.definition.saved) return null;
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuItem onSelect={() => setTemplates(true)}>
            <LayoutTemplate aria-hidden />
            Templates
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {templates && (
        <TemplateDialog definition={extraction.definition} onClose={() => setTemplates(false)} />
      )}
    </>
  );
}
