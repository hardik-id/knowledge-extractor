"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { FILE_TYPE_LABEL, SOURCE_LABEL, formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SourceFile } from "@/types/pipeline";

interface FileTableProps {
  files: readonly SourceFile[];
  selectedIds: readonly string[];
  onToggle: (fileId: string) => void;
  /** Accessible name for the table. */
  label: string;
  /** Prefix each folder with its source. Off when every file comes from one source. */
  showSource: boolean;
}

const HEAD = "px-3 py-2 text-left text-caption font-medium text-ink-muted";

/**
 * The picker's list as a compact table: a tick box, the name, its folder, type, size and
 * modified date. Narrow screens drop the columns they have no room for and show the folder
 * under the name.
 */
export function FileTable({ files, selectedIds, onToggle, label, showSource }: FileTableProps) {
  const where = (file: SourceFile) =>
    showSource ? `${SOURCE_LABEL[file.source]} · ${file.location}` : file.location;
  return (
    <table aria-label={label} className="w-full table-fixed border-collapse text-body">
      <thead>
        <tr className="border-b border-border-subtle">
          <th scope="col" className="w-10 px-3 py-2">
            <span className="sr-only">Selected</span>
          </th>
          <th scope="col" className={HEAD}>
            Name
          </th>
          <th scope="col" className={cn(HEAD, "hidden w-[28%] md:table-cell")}>
            Folder
          </th>
          <th scope="col" className={cn(HEAD, "hidden w-24 sm:table-cell")}>
            Type
          </th>
          <th scope="col" className={cn(HEAD, "hidden w-20 text-right sm:table-cell")}>
            Size
          </th>
          <th scope="col" className={cn(HEAD, "hidden w-32 whitespace-nowrap md:table-cell")}>
            Modified
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle">
        {files.map((file) => {
          const checked = selectedIds.includes(file.id);
          const inputId = `file-${file.id}`;
          return (
            <tr
              key={file.id}
              className={cn("hover:bg-surface-hover", checked && "bg-surface-hover")}
            >
              <td className="px-3 py-2 align-middle">
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={() => onToggle(file.id)}
                />
              </td>
              <td className="px-3 py-2 align-middle">
                <label htmlFor={inputId} className="block cursor-pointer truncate text-ink">
                  {file.name}
                </label>
                <p className="truncate text-caption text-ink-muted md:hidden">{where(file)}</p>
              </td>
              <td className="hidden truncate px-3 py-2 text-ink-muted md:table-cell">
                {where(file)}
              </td>
              <td className="hidden px-3 py-2 text-ink-muted sm:table-cell">
                {FILE_TYPE_LABEL[file.type]}
              </td>
              <td className="hidden px-3 py-2 text-right text-ink-muted sm:table-cell">
                {formatBytes(file.sizeBytes)}
              </td>
              <td className="hidden px-3 py-2 whitespace-nowrap text-ink-muted md:table-cell">
                {formatDate(file.modifiedAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
