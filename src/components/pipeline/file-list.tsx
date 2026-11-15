"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { FILE_TYPE_LABEL, SOURCE_LABEL, formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SourceFile } from "@/types/pipeline";
import { FileTypeIcon } from "./file-type-icon";

interface FileListProps {
  files: SourceFile[];
  /** Pass to show checkboxes. */
  selectedIds?: readonly string[];
  onToggle?: (fileId: string) => void;
  /** Extra content on the right of each row (progress, status, actions). */
  renderTrailing?: (file: SourceFile) => React.ReactNode;
  /** Accessible name for the list. */
  label: string;
  className?: string;
}

/** Reusable file rows: icon, name, location, type, size, date, optional checkbox and trailing slot. */
export function FileList({
  files,
  selectedIds,
  onToggle,
  renderTrailing,
  label,
  className,
}: FileListProps) {
  const selectable = selectedIds !== undefined && onToggle !== undefined;

  return (
    <ul
      aria-label={label}
      className={cn(
        "divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-raised",
        className,
      )}
    >
      {files.map((file) => {
        const checked = selectable && selectedIds.includes(file.id);
        const inputId = `file-${file.id}`;
        return (
          <li
            key={file.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-colors sm:gap-4",
              checked && "bg-surface-tint/60",
            )}
          >
            {selectable && (
              <Checkbox
                id={inputId}
                checked={checked}
                onCheckedChange={() => onToggle(file.id)}
                className="size-5"
              />
            )}
            <FileTypeIcon type={file.type} />
            <div className="min-w-0 flex-1">
              {selectable ? (
                <label
                  htmlFor={inputId}
                  className="block cursor-pointer truncate font-semibold text-ink"
                >
                  {file.name}
                </label>
              ) : (
                <p className="truncate font-semibold text-ink">{file.name}</p>
              )}
              <p className="truncate text-[13px] leading-[18px] text-ink-muted">
                {SOURCE_LABEL[file.source]} · {file.location}
              </p>
            </div>
            <dl className="hidden shrink-0 grid-cols-[auto_auto_auto] gap-x-6 text-right text-[15px] leading-[22px] text-ink-muted tabular-nums sm:grid">
              <dt className="sr-only">Type</dt>
              <dd className="w-20">{FILE_TYPE_LABEL[file.type]}</dd>
              <dt className="sr-only">Size</dt>
              <dd className="w-16">{formatBytes(file.sizeBytes)}</dd>
              <dt className="sr-only">Modified</dt>
              <dd className="hidden w-24 md:block">{formatDate(file.modifiedAt)}</dd>
            </dl>
            {renderTrailing && <div className="shrink-0">{renderTrailing(file)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
