import type { ExtractionDefinitionDraft } from "@/services/contracts";

/** Stands in for the pipeline's saved extraction config until the backend has one. */
export const DEFAULT_EXTRACTION_DEFINITION: ExtractionDefinitionDraft = {
  prompt: "Extract every architecture decision record (ADR) in the document.",
  recordTypes: [
    {
      id: "rt-adr",
      name: "ADR",
      description: "One architecture decision record: a titled decision with its context.",
      fields: [
        {
          id: "f-adr-title",
          key: "title",
          name: "Title",
          description: "The title of the decision.",
          mode: "quote",
          valueType: "text",
          choices: [],
          multiple: false,
        },
        {
          id: "f-adr-status",
          key: "status",
          name: "Status",
          description: "Where the decision stands.",
          mode: "inferred",
          valueType: "choice",
          choices: ["proposed", "accepted", "superseded", "rejected"],
          multiple: false,
        },
        {
          id: "f-adr-decided-on",
          key: "decided_on",
          name: "Decided on",
          description: "The date the decision was made.",
          mode: "inferred",
          valueType: "date",
          choices: [],
          multiple: false,
        },
        {
          id: "f-adr-approved-by",
          key: "approved_by",
          name: "Approved by",
          description: "The people who approved the decision.",
          mode: "quote",
          valueType: "text",
          choices: [],
          multiple: true,
        },
        {
          id: "f-adr-context",
          key: "context",
          name: "Context",
          description: "Why the decision was needed.",
          mode: "quote",
          valueType: "text",
          choices: [],
          multiple: false,
        },
        {
          id: "f-adr-decision",
          key: "decision",
          name: "Decision",
          description: "What was decided.",
          mode: "quote",
          valueType: "text",
          choices: [],
          multiple: false,
        },
      ],
    },
  ],
  output: {
    format: "markdown",
    template: `## {{title}}

**Status:** {{status}}
**Decided on:** {{decided_on}}
**Approved by:**
{{#approved_by}}- {{.}}
{{/approved_by}}
### Context

{{context}}

### Decision

{{decision}}
`,
  },
};
