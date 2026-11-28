import type { DefinitionTemplate } from "@/services/contracts";

/**
 * The backend's starting configurations, copied from `apps/extraction/templates/`
 * of knowledge-extractor-api (same ids, names and definitions, in the order the
 * API lists them: the default first, then by name). `npm run test:api` compares
 * them with what the running backend serves.
 */
export const MOCK_TEMPLATES: readonly DefinitionTemplate[] = [
  {
    id: "adr",
    name: "Architecture decision records",
    description:
      "One architecture decision record per record: title, status, date, approvers, context and decision.",
    definition: {
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
      chunking: { strategy: "auto", size: null },
      output: {
        format: "markdown",
        template:
          "## {{title}}\n\n**Status:** {{status}}\n**Decided on:** {{decided_on}}\n**Approved by:**\n{{#approved_by}}- {{.}}\n{{/approved_by}}\n### Context\n\n{{context}}\n\n### Decision\n\n{{decision}}\n",
      },
    },
  },
  {
    id: "skill",
    name: "Agent skills",
    description:
      "One reusable skill per record, to be written out as an agent skill file (SKILL.md).",
    definition: {
      prompt: "Extract every reusable skill in the document: a repeatable way of doing one task.",
      recordTypes: [
        {
          id: "rt-skill",
          name: "Skill",
          description: "One reusable skill: what it does, when to use it and the steps.",
          fields: [
            {
              id: "f-skill-name",
              key: "name",
              name: "Name",
              description: "The short name of the skill.",
              mode: "quote",
              valueType: "text",
              choices: [],
              multiple: false,
            },
            {
              id: "f-skill-description",
              key: "description",
              name: "Description",
              description: "What the skill does and when to use it, in one or two sentences.",
              mode: "inferred",
              valueType: "text",
              choices: [],
              multiple: false,
            },
            {
              id: "f-skill-when-to-use",
              key: "when_to_use",
              name: "When to use",
              description: "The situations in which the skill applies.",
              mode: "quote",
              valueType: "text",
              choices: [],
              multiple: true,
            },
            {
              id: "f-skill-prerequisites",
              key: "prerequisites",
              name: "Prerequisites",
              description: "What must be in place before starting.",
              mode: "quote",
              valueType: "text",
              choices: [],
              multiple: true,
            },
            {
              id: "f-skill-steps",
              key: "steps",
              name: "Steps",
              description: "The steps, in order.",
              mode: "quote",
              valueType: "text",
              choices: [],
              multiple: true,
            },
          ],
        },
      ],
      chunking: { strategy: "auto", size: null },
      output: {
        format: "markdown",
        template:
          "---\nname: {{name}}\ndescription: {{description}}\n---\n\n## When to use\n\n{{#when_to_use}}- {{.}}\n{{/when_to_use}}\n## Before you start\n\n{{#prerequisites}}- {{.}}\n{{/prerequisites}}\n## Steps\n\n{{#steps}}- {{.}}\n{{/steps}}",
      },
    },
  },
  {
    id: "blank",
    name: "Blank",
    description: "Nothing set up: start from scratch, with the assistant.",
    definition: {
      prompt: "",
      recordTypes: [],
      chunking: { strategy: "auto", size: null },
      output: {
        format: "markdown",
        template: "",
      },
    },
  },
  {
    id: "policy-rule",
    name: "Policy rules",
    description:
      "One rule of a policy per record: what it says, who it applies to, its condition and exceptions.",
    definition: {
      prompt: "Extract every rule of the policy: each obligation, permission or prohibition.",
      recordTypes: [
        {
          id: "rt-rule",
          name: "Rule",
          description: "One rule of a policy.",
          fields: [
            {
              id: "f-rule-rule",
              key: "rule",
              name: "Rule",
              description: "The rule as written.",
              mode: "quote",
              valueType: "text",
              choices: [],
              multiple: false,
            },
            {
              id: "f-rule-kind",
              key: "kind",
              name: "Kind",
              description: "Whether the rule requires, allows or forbids.",
              mode: "inferred",
              valueType: "choice",
              choices: ["obligation", "permission", "prohibition"],
              multiple: false,
            },
            {
              id: "f-rule-applies-to",
              key: "applies_to",
              name: "Applies to",
              description: "Who or what the rule applies to.",
              mode: "inferred",
              valueType: "text",
              choices: [],
              multiple: true,
            },
            {
              id: "f-rule-condition",
              key: "condition",
              name: "Condition",
              description: "When the rule applies.",
              mode: "quote",
              valueType: "text",
              choices: [],
              multiple: false,
            },
            {
              id: "f-rule-exceptions",
              key: "exceptions",
              name: "Exceptions",
              description: "The cases the rule does not cover.",
              mode: "quote",
              valueType: "text",
              choices: [],
              multiple: true,
            },
            {
              id: "f-rule-effective-from",
              key: "effective_from",
              name: "Effective from",
              description: "The date the rule takes effect.",
              mode: "inferred",
              valueType: "date",
              choices: [],
              multiple: false,
            },
          ],
        },
      ],
      chunking: { strategy: "auto", size: null },
      output: {
        format: "json",
        template: "",
      },
    },
  },
];

/** The template a workspace starts from when none is chosen. */
export const DEFAULT_TEMPLATE_ID = "adr";
