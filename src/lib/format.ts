import type { FileType, SourceKind } from "@/types/pipeline";

const byteUnits = ["B", "KB", "MB", "GB"] as const;

/** 1536 → "1.5 KB" */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${byteUnits[unit]}`;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "2026-11-02T09:00:00Z" → "2 Nov 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFormat.format(d);
}

export const FILE_TYPE_LABEL: Record<FileType, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  pptx: "PowerPoint",
  html: "Web page",
  md: "Markdown",
  txt: "Text",
};

export const SOURCE_LABEL: Record<SourceKind, string> = {
  confluence: "Confluence",
  sharepoint: "SharePoint",
  upload: "Upload",
  storage: "Storage",
};

/** "Q3 Report.xlsx" → "q3-report.md" */
export function toMarkdownName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "document"}.md`;
}

/** Plural helper: plural(1, "file") → "1 file", plural(3, "file") → "3 files" */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}
