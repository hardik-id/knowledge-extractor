import type { SourceFile } from "@/types/pipeline";
import { MOCK_FILES } from "./files";
import { mockEnrichedMarkdownFor } from "./markdown";

/**
 * Example storage container for Knowledge Studio: documents the pipeline has
 * already enriched. Each one is the enriched Markdown of a file in `files.ts`,
 * so the default ADR extraction finds records in the two ADR documents.
 */

/** Which file's enriched Markdown a document holds, with the document's own name and place. */
const DOCUMENTS: { from: string; name: string; location: string }[] = [
  {
    from: "cf-005",
    name: "architecture-decisions-2026.md",
    location: "enriched / engineering / architecture",
  },
  { from: "sp-005", name: "platform-adrs.md", location: "enriched / engineering / architecture" },
  { from: "cf-003", name: "incident-runbook.md", location: "enriched / engineering / operations" },
  { from: "cf-004", name: "api-style-guide.md", location: "enriched / engineering / standards" },
  { from: "cf-001", name: "leave-policy-2026.md", location: "enriched / hr / policies" },
  { from: "cf-002", name: "onboarding-checklist.md", location: "enriched / hr / onboarding" },
  { from: "sp-001", name: "q3-revenue-by-region.md", location: "enriched / finance / reporting" },
  {
    from: "sp-002",
    name: "supplier-contract-template.md",
    location: "enriched / legal / templates",
  },
  { from: "sp-003", name: "product-roadmap-2027.md", location: "enriched / product / planning" },
  {
    from: "sp-004",
    name: "security-awareness-training.md",
    location: "enriched / it / compliance",
  },
];

/** A short, stable hash of the text, so an ETag is the same after every reload. */
function etagOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

const TEXTS = new Map<string, string>();

export const MOCK_DOCUMENTS: SourceFile[] = DOCUMENTS.map(({ from, name, location }) => {
  const origin = MOCK_FILES.find((f) => f.id === from);
  if (!origin) throw new Error(`No mock file ${from}`);
  const text = mockEnrichedMarkdownFor(origin);
  const id = `doc-${name.replace(/\.md$/, "")}`;
  TEXTS.set(id, text);
  return {
    id,
    name,
    source: "storage",
    type: "md",
    sizeBytes: byteLength(text),
    location,
    modifiedAt: origin.modifiedAt,
    etag: etagOf(text),
  };
});

/** The text of a document, or undefined for an id that is not in the container. */
export function mockDocumentText(id: string): string | undefined {
  return TEXTS.get(id);
}
