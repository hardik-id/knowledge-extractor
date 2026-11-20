"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SOURCE_LABEL } from "@/lib/format";
import type { SourceKind } from "@/types/pipeline";

interface SourcePickerProps {
  sources: readonly SourceKind[];
  value: SourceKind;
  onChange: (source: SourceKind) => void;
}

/**
 * Where to look for files. Tabs only switch the source; the list renders below.
 * A single source shows no tabs.
 */
export function SourcePicker({ sources, value, onChange }: SourcePickerProps) {
  if (sources.length < 2) return null;
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as SourceKind)}>
      <TabsList aria-label="File source" className="w-full sm:w-fit">
        {sources.map((s) => (
          <TabsTrigger key={s} value={s} className="px-4">
            {SOURCE_LABEL[s]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
