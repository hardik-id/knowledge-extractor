"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appProfile } from "@/config/app-profile";
import { SOURCE_LABEL } from "@/lib/format";
import type { SourceKind } from "@/types/pipeline";

interface SourcePickerProps {
  value: SourceKind;
  onChange: (source: SourceKind) => void;
}

/**
 * Where to look for files. Tabs only switch the source; the list renders below.
 * An app with a single source shows no tabs.
 */
export function SourcePicker({ value, onChange }: SourcePickerProps) {
  if (appProfile.sources.length < 2) return null;
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as SourceKind)}>
      <TabsList aria-label="File source" className="h-11! w-full bg-surface-tint sm:w-fit">
        {appProfile.sources.map((s) => (
          <TabsTrigger key={s} value={s} className="px-4 text-[15px]">
            {SOURCE_LABEL[s]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
