import type { SourceFile } from "@/types/pipeline";
import { MOCK_FILES } from "@/mocks/files";
import { FILE_TYPE_LABEL, SOURCE_LABEL, formatDate } from "@/lib/format";

/** Architecture decision records, for the two files in Engineering / Architecture. */
const ADR_BODIES: Record<string, string> = {
  "Architecture decisions 2026.pdf": `This log holds the architecture decisions of the platform group.

## ADR-012: Use Postgres for the orders service

**Status:** Accepted
**Date:** 3 November 2026
**Approved by:** J. Smit, A. de Vries

### Context

The orders service needs transactions across several tables, and the team already runs Postgres for billing.

### Decision

We store orders in Postgres and drop the document store pilot.

### Consequences

- One database engine to operate 🚀
- Schema changes need migrations
- Reporting can query orders directly

## ADR-013: Adopt OpenTelemetry for tracing

**Status:** Proposed
**Date:** 10 November 2026

### Context

Each service logs traces in its own format, which makes incidents slow to follow.

### Decision

All services emit OpenTelemetry traces to the shared collector.

### Consequences

- Services need the SDK added
- Vendor lock-in is reduced

## ADR-014: Retire the legacy SOAP gateway

**Status:** Superseded
**Date:** 2026-09-14
**Approved by:** M. Jansen

### Context

The SOAP gateway has two remaining clients and no owner.

### Decision

The gateway is replaced by the REST API and switched off in March.

### Consequences

- The two clients must migrate first
- The gateway runbook is archived`,
  "Platform ADRs.pptx": `## ADR-101: Use feature flags for risky releases

**Status:** Accepted
**Date:** 1 October 2026
**Approved by:** P. Bakker

### Context

Releases of the checkout flow caused two rollbacks this quarter.

### Decision

Risky changes ship behind a flag and are enabled per customer group.

### Consequences

- Flags need an owner and an expiry date
- Test runs cover both settings

## ADR-102: Move build agents to spot instances

**Status:** Rejected
**Date:** 12 October 2026
**Approved by:** P. Bakker, L. Visser

### Context

Build costs grew by 40% since spring.

### Decision

We keep on-demand agents because interrupted builds cost more than they save.

### Consequences

- Cost review stays on the agenda

## ADR-103: Standardise on TypeScript for new services

**Status:** Proposed
**Date:** 20 October 2026

### Context

New services use three languages, which splits the on-call pool.

### Decision

New services are written in TypeScript unless a review agrees otherwise.

### Consequences

- Existing services stay as they are
- A starter template is needed`,
};

/** Example Markdown output for a source file, until the real converter exists. */
export function mockMarkdownFor(file: SourceFile): string {
  const adrs = ADR_BODIES[file.name];
  const body = adrs
    ? adrs
    : file.type === "xlsx"
      ? `## Sheet: Summary

| Region | Q2 (€k) | Q3 (€k) | Change |
| --- | ---: | ---: | ---: |
| North | 1,204 | 1,322 | +9.8% |
| South | 988 | 951 | −3.7% |
| West | 1,410 | 1,566 | +11.1% |

> Converted from 3 sheets. Formulas were replaced by their values.`
      : `## Summary

This document was converted from ${FILE_TYPE_LABEL[file.type]} to Markdown. Headings, lists and tables are kept; images are replaced by their alt text.

## Key points

1. Applies to all permanent and temporary staff.
2. Requests go through the self-service portal.
3. Managers approve within **5 working days**.

## Contacts

- Owner: *${file.location.split(" / ")[0]} team*
- Review cycle: yearly`;

  return `# ${file.name.replace(/\.[^.]+$/, "")}

_Source: ${SOURCE_LABEL[file.source]} · ${file.location} · last modified ${formatDate(file.modifiedAt)}_

${body}
`;
}

const yaml = (value: string) => JSON.stringify(value); // a double-quoted scalar is valid YAML
const yamlList = (key: string, items: string[]) =>
  [`${key}:`, ...items.map((item) => `  - ${yaml(item)}`)].join("\n");

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

function documentTypeFor(file: SourceFile): string {
  const name = file.name.toLowerCase();
  if (/policy|policies/.test(name)) return "policy";
  if (/runbook|checklist|guide|how-to/.test(name)) return "procedure";
  if (file.type === "xlsx") return "report";
  if (file.type === "pptx") return "presentation";
  return "reference";
}

function classificationFields(file: SourceFile): string[] {
  const topic = file.location.split(" / ")[0];
  const sensitivity = /^(hr|finance|legal)$/i.test(topic) ? "confidential" : "internal";
  return [
    `document_type: ${yaml(documentTypeFor(file))}`,
    `topic: ${yaml(topic)}`,
    `sensitivity: ${yaml(sensitivity)}`,
  ];
}

function relatedDocumentsFor(file: SourceFile): string[] {
  const siblings = MOCK_FILES.filter(
    (f) => f.location === file.location && f.name !== file.name,
  ).map((f) => f.name);
  if (siblings.length > 0) return siblings.slice(0, 3);
  return ["Document index.md", `${file.location.split(" / ")[0]} handbook.md`];
}

/**
 * What classification writes: a copy of the transform text with a YAML front
 * matter block (document_type, topic, sensitivity) added at the top.
 */
export function mockClassifiedMarkdownFor(file: SourceFile): string {
  return `---\n${classificationFields(file).join("\n")}\n---\n\n${mockMarkdownFor(file)}`;
}

/**
 * What enrichment leaves in the same copy: the classification keys plus
 * summary, keywords and related_documents.
 */
export function mockEnrichedMarkdownFor(file: SourceFile): string {
  const topic = file.location.split(" / ")[0];
  const summary = `${baseName(file.name)} sets out how ${topic} work is requested and approved. Managers approve within 5 working days.`;
  const keywords = [topic.toLowerCase(), documentTypeFor(file), "approval", "self-service"];
  const front = [
    ...classificationFields(file),
    `summary: ${yaml(summary)}`,
    yamlList("keywords", keywords),
    yamlList("related_documents", relatedDocumentsFor(file)),
  ];
  return `---\n${front.join("\n")}\n---\n\n${mockMarkdownFor(file)}`;
}
