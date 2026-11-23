import { DEFAULT_EXTRACTION_DEFINITION } from "@/mocks/extraction";
import type {
  AssistantProposal,
  ExtractionDefinitionDraft,
  FieldDef,
  FieldMode,
  FieldValueType,
  RecordType,
} from "../contracts";

/**
 * A stand-in for the assistant: keyword rules, no model. It is deterministic
 * and meant for demoing the flow. The real service reads the documents.
 *
 * Phrases it understands (case does not matter):
 *   bare prompt: "ADR" / "architecture decision", "policy" / "requirement" /
 *     "regulation" / "must", otherwise "extract <things> from ..."
 *   "add (a field for) X", "add X as inferred" (or derive / normalise / summarise)
 *   "remove X" / "drop X"
 *   "make X exact" / "quote" / "verbatim" / "inferred"
 *   "rename X to Y"
 *   "split A and B" (e.g. "split approver and approval date")
 *   "X can have several values"
 *   "output as json" / "csv" / "markdown"
 *   "use X in the template" / "add X to the template"
 */

export interface AssistantReply {
  text: string;
  proposal: AssistantProposal | null;
}

export interface AssistantOptions {
  newId: () => string;
}

type Reason = { path: string; reason: string };
type Draft = ExtractionDefinitionDraft;

const EXAMPLES =
  'Try "add a field for approval date" or "make approved by exact". I can also remove or rename a field, split one in two, allow several values, change the output to json, csv or markdown, or use a field in the template.';

const NOTHING = (what: string) => ({
  text: `${what} ${EXAMPLES}`,
  proposal: null,
});

/** Same rule as the field editor in the UI: lower case, other characters to `_`. */
export function keyFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueKey(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = keyFromName(name) || "field";
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+field$/, "");

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function cleanName(raw: string): string {
  const name = raw
    .replace(/["'`]/g, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+field$/i, "")
    .trim();
  return capitalise(name);
}

function makeField(
  name: string,
  newId: () => string,
  taken: Iterable<string>,
  options: Partial<Pick<FieldDef, "mode" | "valueType" | "multiple" | "choices">> = {},
): FieldDef {
  const valueType: FieldValueType = options.valueType ?? (/\bdate\b/i.test(name) ? "date" : "text");
  return {
    id: newId(),
    key: uniqueKey(name, taken),
    name,
    description: `The ${name.toLowerCase()}.`,
    mode: options.mode ?? "quote",
    valueType,
    choices: options.choices ?? [],
    multiple: options.multiple ?? false,
  };
}

// ── Templates ───────────────────────────────────────────────────────────

const templateLine = (field: Pick<FieldDef, "key" | "name" | "multiple">) =>
  field.multiple
    ? `**${field.name}:**\n{{#${field.key}}}- {{.}}\n{{/${field.key}}}`
    : `**${field.name}:** {{${field.key}}}`;

function appendToTemplate(template: string, field: FieldDef): string {
  if (template.includes(`{{${field.key}}}`) || template.includes(`{{#${field.key}}}`)) {
    return template;
  }
  const base = template.endsWith("\n") || template === "" ? template : `${template}\n`;
  return `${base}\n${templateLine(field)}\n`;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function removeFromTemplate(template: string, field: FieldDef): string {
  const key = escapeRegExp(field.key);
  return template
    .replace(new RegExp(`^\\*\\*${escapeRegExp(field.name)}:\\*\\*[^\\n]*\\n?`, "gm"), "")
    .replace(new RegExp(`\\{\\{#${key}\\}\\}[\\s\\S]*?\\{\\{/${key}\\}\\}\\n?`, "g"), "")
    .replace(new RegExp(`^[^\\n]*\\{\\{${key}\\}\\}[^\\n]*\\n?`, "gm"), "");
}

function templateFor(recordType: RecordType): string {
  const [first, ...rest] = recordType.fields;
  if (!first) return "";
  return `## {{${first.key}}}\n\n${rest.map(templateLine).join("\n")}\n`;
}

// ── Starting from a bare prompt ─────────────────────────────────────────

function freshIds(definition: Draft, newId: () => string): Draft {
  const copy = structuredClone(definition);
  for (const recordType of copy.recordTypes) {
    recordType.id = newId();
    for (const field of recordType.fields) field.id = newId();
  }
  return copy;
}

function fieldReasons(recordType: RecordType): Reason[] {
  return [
    { path: recordType.name, reason: `Looks for ${recordType.description.toLowerCase()}` },
    ...recordType.fields.map((field) => ({
      path: `${recordType.name} / ${field.name}`,
      reason:
        field.mode === "quote"
          ? `Copied exactly from the text. ${field.description}`
          : `Worked out from the text, with the passages it is based on. ${field.description}`,
    })),
  ];
}

function mainNoun(text: string): string | null {
  const match = text.match(
    /\b(?:extract|find|pull out|list|get|collect)\s+(?:all\s+|every\s+|each\s+|the\s+|any\s+)*([a-z][a-z -]*?)(?:\s+(?:from|in|of|out of|with)\b|[.,;:!?]|$)/i,
  );
  const last = match?.[1].trim().split(/\s+/).pop();
  if (!last) return null;
  const singular =
    last.length > 3 && /s$/i.test(last) && !/ss$/i.test(last) ? last.slice(0, -1) : last;
  return capitalise(singular.toLowerCase());
}

function propose(definition: Draft, text: string, { newId }: AssistantOptions): AssistantReply {
  const haystack = `${text} ${definition.prompt}`.toLowerCase();
  let next: Draft;
  let reply: string;

  if (/\badrs?\b|architecture decision/.test(haystack)) {
    const adr = freshIds(DEFAULT_EXTRACTION_DEFINITION, newId);
    next = {
      ...adr,
      prompt: definition.prompt.trim() || adr.prompt,
      chunking: structuredClone(definition.chunking),
    };
    reply =
      "I set this up for architecture decision records: the title, the context and the decision are copied exactly, and the status and date are worked out from the text. The template shows each record as a short page.";
  } else if (/\bpolic(?:y|ies)\b|requirement|regulation|\bmust\b/.test(haystack)) {
    const recordType: RecordType = {
      id: newId(),
      name: "Requirement",
      description: "One requirement a policy or regulation places on someone.",
      fields: [],
    };
    recordType.fields = [
      makeField("Requirement", newId, [], { mode: "quote" }),
      makeField("Applies to", newId, ["requirement"], { mode: "quote" }),
      makeField("Category", newId, ["requirement", "applies_to"], {
        mode: "inferred",
        valueType: "choice",
        choices: ["security", "privacy", "operational", "legal", "other"],
      }),
    ];
    recordType.fields[0].description = "The requirement, in the exact wording of the document.";
    recordType.fields[1].description = "Who or what the requirement applies to.";
    recordType.fields[2].description = "The kind of requirement.";
    next = {
      prompt: definition.prompt.trim() || "Extract every requirement in the document.",
      recordTypes: [recordType],
      output: { format: "markdown", template: templateFor(recordType) },
      chunking: structuredClone(definition.chunking),
    };
    reply =
      "I chose exact quotes for the requirement and who it applies to, because requirements must not be reworded. The category is worked out from the text.";
  } else {
    const name = mainNoun(text) ?? mainNoun(definition.prompt) ?? "Item";
    const recordType: RecordType = {
      id: newId(),
      name,
      description: `One ${name.toLowerCase()} found in the document.`,
      fields: [],
    };
    recordType.fields = [
      makeField("Title", newId, [], { mode: "quote" }),
      makeField("Summary", newId, ["title"], { mode: "inferred" }),
    ];
    recordType.fields[0].description = `The title of the ${name.toLowerCase()}.`;
    recordType.fields[1].description = `A short summary of the ${name.toLowerCase()}.`;
    next = {
      prompt: definition.prompt.trim() || `Extract every ${name.toLowerCase()} in the document.`,
      recordTypes: [recordType],
      output: { format: "markdown", template: templateFor(recordType) },
      chunking: structuredClone(definition.chunking),
    };
    reply = `I started with one record type, ${name}, with a title copied exactly and a summary worked out from the text. Ask me to add or change fields from here.`;
  }

  const reasons = [
    ...next.recordTypes.flatMap(fieldReasons),
    { path: "Template", reason: "Shows each record using the field keys." },
  ];
  return { text: reply, proposal: { definition: next, reasons } };
}

// ── Changing an existing definition ─────────────────────────────────────

interface Found {
  recordType: RecordType;
  index: number;
}

function findField(definition: Draft, phrase: string, message: string): Found | null {
  const wanted = words(phrase);
  if (!wanted) return null;
  const lower = message.toLowerCase();
  const types = [...definition.recordTypes].sort(
    (a, b) =>
      Number(lower.includes(b.name.toLowerCase())) - Number(lower.includes(a.name.toLowerCase())),
  );
  const tests = [
    (f: FieldDef) => words(f.name) === wanted || words(f.key) === wanted,
    (f: FieldDef) => ` ${words(f.name)} `.includes(` ${wanted} `),
  ];
  for (const test of tests) {
    for (const recordType of types) {
      const index = recordType.fields.findIndex(test);
      if (index >= 0) return { recordType, index };
    }
  }
  return null;
}

/** "approver" and "approved by" share a stem: used to find what "split approver and date" means. */
function sharesStem(field: FieldDef, phrase: string): boolean {
  const a = words(phrase).split(" ")[0] ?? "";
  return words(field.name)
    .split(" ")
    .some((w) => {
      let n = 0;
      while (n < w.length && n < a.length && w[n] === a[n]) n++;
      return n >= 5;
    });
}

function targetType(definition: Draft, message: string): RecordType {
  const lower = message.toLowerCase();
  return (
    definition.recordTypes.find((rt) => lower.includes(rt.name.toLowerCase())) ??
    definition.recordTypes[0]
  );
}

const notFound = (phrase: string, definition: Draft) =>
  NOTHING(
    `I can't find a field called "${phrase}". The fields are ${definition.recordTypes
      .flatMap((rt) => rt.fields.map((f) => f.name))
      .join(", ")}.`,
  );

const done = (text: string, definition: Draft, reasons: Reason[]): AssistantReply => ({
  text,
  proposal: { definition, reasons },
});

function modeOf(message: string): FieldMode {
  return /inferred|derive|normali[sz]|summar/i.test(message) ? "inferred" : "quote";
}

function refine(definition: Draft, message: string, { newId }: AssistantOptions): AssistantReply {
  const next = structuredClone(definition);
  const m = (re: RegExp) => message.match(re);
  const path = (f: Found) => `${f.recordType.name} / ${f.recordType.fields[f.index].name}`;
  const locate = (phrase: string) => findField(next, phrase, message);
  let hit: RegExpMatchArray | null;

  // rename X to Y
  if ((hit = m(/\brename\s+(.+?)\s+to\s+(.+?)\s*[.!]?$/i))) {
    const found = locate(hit[1]);
    if (!found) return notFound(hit[1], next);
    const field = found.recordType.fields[found.index];
    const before = path(found);
    const name = cleanName(hit[2]);
    field.name = name;
    return done(
      `I renamed "${before}" to "${name}". Its key stays "${field.key}", so the template keeps working.`,
      next,
      [
        {
          path: before,
          reason: `Renamed to "${name}"; the key is unchanged so existing output keeps its shape.`,
        },
      ],
    );
  }

  // split A and B
  if ((hit = m(/\bsplit\s+(?:the\s+)?(.+?)\s+and\s+(.+?)\s*[.!]?$/i))) {
    const [a, b] = [cleanName(hit[1]), cleanName(hit[2])];
    const recordType = targetType(next, message);
    const match =
      locate(hit[1]) ??
      locate(hit[2]) ??
      (() => {
        const index = recordType.fields.findIndex((f) => sharesStem(f, hit![1]));
        return index >= 0 ? { recordType, index } : null;
      })();
    const owner = match?.recordType ?? recordType;
    const old = match ? owner.fields[match.index] : null;
    const taken = owner.fields.filter((f) => f !== old).map((f) => f.key);
    const first = makeField(a, newId, taken, {
      mode: old?.mode ?? "quote",
      multiple: old?.multiple ?? false,
    });
    const second = makeField(b, newId, [...taken, first.key], { mode: old?.mode ?? "quote" });
    if (old && match) owner.fields.splice(match.index, 1, first, second);
    else owner.fields.push(first, second);
    if (next.output.format === "markdown") {
      if (old) next.output.template = removeFromTemplate(next.output.template, old);
      next.output.template = appendToTemplate(
        appendToTemplate(next.output.template, first),
        second,
      );
    }
    return done(
      old
        ? `I replaced "${old.name}" with two fields, "${a}" and "${b}".`
        : `There was no single field to split, so I added two: "${a}" and "${b}".`,
      next,
      [
        ...(old
          ? [{ path: `${owner.name} / ${old.name}`, reason: "Replaced by two separate fields." }]
          : []),
        {
          path: `${owner.name} / ${a}`,
          reason: "Gets its own field so it can be checked on its own.",
        },
        {
          path: `${owner.name} / ${b}`,
          reason: "Gets its own field so it can be checked on its own.",
        },
      ],
    );
  }

  // X can have several values
  if (
    (hit = m(
      /^\s*(?:the\s+)?(.+?)\s+can\s+have\s+(?:several|multiple|many|more than one)\s+values?/i,
    ))
  ) {
    const found = locate(hit[1]);
    if (!found) return notFound(hit[1], next);
    const field = found.recordType.fields[found.index];
    field.multiple = true;
    if (next.output.format === "markdown") {
      const key = escapeRegExp(field.key);
      const labelled = new RegExp(`^(\\*\\*[^*\\n]+:\\*\\*)[ \\t]*\\{\\{${key}\\}\\}[ \\t]*$`, "m");
      const alone = new RegExp(`^[ \\t]*\\{\\{${key}\\}\\}[ \\t]*$`, "m");
      const list = `{{#${field.key}}}- {{.}}\n{{/${field.key}}}`;
      const template = next.output.template;
      next.output.template = labelled.test(template)
        ? template.replace(labelled, `$1\n${list}`)
        : template.replace(alone, list);
    }
    return done(`"${field.name}" can now hold several values.`, next, [
      {
        path: path(found),
        reason: "A record can have more than one of these, so each is listed on its own.",
      },
    ]);
  }

  // make X exact / inferred
  if ((hit = m(/\bmake\s+(.+?)\s+(?:be\s+|an?\s+)?(exact|quote|quoted|verbatim|inferred)\b/i))) {
    const found = locate(hit[1]);
    if (!found) return notFound(hit[1], next);
    const field = found.recordType.fields[found.index];
    field.mode = /inferred/i.test(hit[2]) ? "inferred" : "quote";
    return done(
      field.mode === "quote"
        ? `"${field.name}" is now copied exactly from the text.`
        : `"${field.name}" is now worked out by the model, with the passages it used as evidence.`,
      next,
      [
        {
          path: path(found),
          reason:
            field.mode === "quote"
              ? "Copied word for word, so the value always matches the document."
              : "Worked out from the text, which suits values that are not written down as such.",
        },
      ],
    );
  }

  // output as json / csv / markdown
  if ((hit = m(/\b(?:output|export|format|write)\b.*?\b(json|csv|markdown)\b/i))) {
    const format = hit[1].toLowerCase() as Draft["output"]["format"];
    next.output.format = format;
    if (format === "markdown" && !next.output.template.trim()) {
      next.output.template = next.recordTypes[0] ? templateFor(next.recordTypes[0]) : "";
    }
    return done(`The output is now ${format}.`, next, [
      { path: "Output", reason: `Records are written as ${format}.` },
    ]);
  }

  // use / add X in the template
  if ((hit = m(/\b(?:use|add|include|put)\s+(.+?)\s+(?:in|to|into|on)\s+(?:the\s+)?template\b/i))) {
    const found = locate(hit[1]);
    if (!found) return notFound(hit[1], next);
    const field = found.recordType.fields[found.index];
    const before = next.output.template;
    next.output.template = appendToTemplate(before, field);
    if (next.output.template === before) {
      return NOTHING(`"${field.name}" is already in the template.`);
    }
    return done(`I added "${field.name}" to the template.`, next, [
      { path: "Template", reason: `Shows "${field.name}" for each record.` },
    ]);
  }

  // add (a field for) X
  if (
    (hit = m(
      /\badd\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:field\s+)?(?:for\s+|called\s+|named\s+)?(.+?)\s*[.!]?$/i,
    ))
  ) {
    const name = cleanName(
      hit[1].split(/\s+(?:to|on|in|as|that|which|and derive|and normali[sz]e|,)\b|,/i)[0],
    );
    if (!name) return NOTHING("I couldn't tell which field to add.");
    const recordType = targetType(next, message);
    if (!recordType) return NOTHING("There is no record type to add a field to.");
    const key = keyFromName(name);
    if (recordType.fields.some((f) => f.key === key)) {
      return NOTHING(`"${recordType.name}" already has a field "${name}".`);
    }
    const mode = modeOf(message);
    const field = makeField(
      name,
      newId,
      recordType.fields.map((f) => f.key),
      { mode },
    );
    recordType.fields.push(field);
    if (next.output.format === "markdown") {
      next.output.template = appendToTemplate(next.output.template, field);
    }
    return done(
      `I added "${name}" to ${recordType.name}, ${mode === "quote" ? "copied exactly from the text" : "worked out from the text"}.${
        next.output.format === "markdown" ? " It is in the template too." : ""
      }`,
      next,
      [
        {
          path: `${recordType.name} / ${name}`,
          reason:
            mode === "quote"
              ? "New field, copied exactly from the document."
              : "New field, worked out from the document.",
        },
        ...(next.output.format === "markdown"
          ? [{ path: "Template", reason: `Shows "${name}" for each record.` }]
          : []),
      ],
    );
  }

  // remove / drop X
  if ((hit = m(/\b(?:remove|drop|delete)\s+(.+?)(?:\s+from\s+.+?)?\s*[.!]?$/i))) {
    const found = locate(hit[1]);
    if (!found) return notFound(hit[1], next);
    const [field] = found.recordType.fields.splice(found.index, 1);
    next.output.template = removeFromTemplate(next.output.template, field);
    return done(
      `I removed "${field.name}" from ${found.recordType.name} and from the template.`,
      next,
      [
        { path: `${found.recordType.name} / ${field.name}`, reason: "Removed, as you asked." },
        { path: "Template", reason: `No longer shows "${field.name}".` },
      ],
    );
  }

  return NOTHING("I didn't understand that one.");
}

/** Every proposal is a complete draft: keys filled and unique, choice fields with choices. */
function normalise(definition: Draft): Draft {
  for (const recordType of definition.recordTypes) {
    const seen: string[] = [];
    for (const field of recordType.fields) {
      field.key = uniqueKey(field.key || field.name, seen);
      seen.push(field.key);
      if (field.valueType === "choice" && field.choices.length === 0) field.choices = ["other"];
    }
  }
  return definition;
}

export function assistantReply(
  text: string,
  definition: ExtractionDefinitionDraft,
  options: AssistantOptions,
): AssistantReply {
  const message = text.trim();
  const reply =
    definition.recordTypes.length === 0
      ? propose(definition, message, options)
      : refine(definition, message, options);
  if (reply.proposal) normalise(reply.proposal.definition);
  return reply;
}
