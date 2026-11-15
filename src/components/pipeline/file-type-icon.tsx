import { FileCode, FileSpreadsheet, FileText, FileType, Globe, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileType as FileKind } from "@/types/pipeline";

const ICONS: Record<FileKind, typeof FileText> = {
  pdf: FileType,
  docx: FileText,
  xlsx: FileSpreadsheet,
  pptx: Presentation,
  html: Globe,
  md: FileCode,
  txt: FileText,
};

export function FileTypeIcon({ type, className }: { type: FileKind; className?: string }) {
  const Icon = ICONS[type];
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-md bg-surface-tint text-link",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
