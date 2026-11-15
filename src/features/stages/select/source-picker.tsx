"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SOURCE_LABEL } from "@/lib/format";
import type { SourceKind } from "@/types/pipeline";

const SOURCES: SourceKind[] = ["confluence", "sharepoint", "upload"];

interface SourcePickerProps {
  value: SourceKind;
  onChange: (source: SourceKind) => void;
}

/** Where to look for files. Tabs only switch the source; the list renders below. */
export function SourcePicker({ value, onChange }: SourcePickerProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as SourceKind)}>
      <TabsList aria-label="File source" className="h-11! w-full bg-surface-tint sm:w-fit">
        {SOURCES.map((s) => (
          <TabsTrigger key={s} value={s} className="px-4 text-[15px]">
            {SOURCE_LABEL[s]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
