import type { SourceFile } from "@/types/pipeline";

/**
 * Where extraction reads its text for a file of a run: the document itself when
 * the file is a storage document, otherwise the enrich stage's output.
 */
export function extractionInputKind(file: SourceFile): "enrich" | "document" {
  return file.source === "storage" ? "document" : "enrich";
}
