"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ProposalChange } from "@/features/extraction/proposal-diff";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { plural } from "@/lib/format";
import type { FieldDef, RecordType } from "@/services/contracts";
import { useProposal, type ProposalInfo } from "./use-proposal";
import { useWorkspace } from "./workspace-state";

const norm = (s: string) => s.trim().toLowerCase();

/** The proposal's record type for one of the draft's: by id, else by the name it kept. */
function proposedType(info: ProposalInfo, type: RecordType): RecordType | undefined {
  const types = info.proposal.definition.recordTypes;
  return (
    types.find((t) => t.id === type.id) ??
    types.find((t) => norm(t.name) !== "" && norm(t.name) === norm(type.name))
  );
}

/** The change belongs to this record type (the proposal's id for most, the current one's for a removal). */
function inType(change: ProposalChange, type: RecordType, proposed: RecordType | undefined) {
  return change.typeId === type.id || (!!proposed && change.typeId === proposed.id);
}

/** The draft's field a change concerns: by id, else the field the assistant re-issued under another id. */
function rowFieldId(change: ProposalChange, type: RecordType, proposed: RecordType | undefined) {
  if (change.fieldId == null) return null;
  if (type.fields.some((f) => f.id === change.fieldId)) return change.fieldId;
  const issued = proposed?.fields.find((f) => f.id === change.fieldId);
  if (!issued) return null;
  return (
    type.fields.find((f) => f.key === issued.key || norm(f.name) === norm(issued.name))?.id ?? null
  );
}

const TYPE_LABEL: Record<FieldDef["valueType"], string> = {
  text: "Text",
  date: "Date",
  number: "Number",
  choice: "Choice",
};

/** What a line says: the change without the "Type / Field:" it starts with. */
function lineText(change: ProposalChange): string {
  if (change.kind === "removed-field") return "This field would be removed";
  const at = change.text.indexOf(": ");
  const text = at >= 0 ? change.text.slice(at + 2) : change.text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "3 suggested changes · Keep all · Discard all", above the table. */
export function ProposalBar({
  definition,
  onDecided,
}: {
  definition: ExtractionDefinitionState;
  onDecided?: (said: string) => void;
}) {
  const { info, keepAll, discardAll } = useProposal(definition, onDecided);
  const { selectedTypeId } = useWorkspace();
  if (!info) return null;
  const type = info.current.recordTypes.find((t) => t.id === selectedTypeId);
  const proposed = type && proposedType(info, type);
  // What has no row in this table (the prompt, the output, other record types) is listed here.
  // A record type the proposal adds is drawn under the table, with its fields (ProposedTypes).
  const elsewhere = info.changes.filter(
    (c) =>
      c.kind !== "added-type" &&
      !(
        type &&
        inType(c, type, proposed) &&
        (c.kind === "added-field" || c.kind === "removed-field" || c.kind === "changed-field")
      ),
  );
  const count = info.changes.length;
  return (
    <section
      aria-label="Suggested changes"
      className="sticky top-0 z-10 border-b border-border-subtle bg-surface-tint"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2 pr-3 pl-4">
        <Sparkles aria-hidden className="size-4 shrink-0 text-link" />
        <span className="font-semibold text-ink-heading">
          {count} suggested {count === 1 ? "change" : "changes"}
        </span>
        <span className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={keepAll}>
          Keep all
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={discardAll}>
          Discard all
        </Button>
      </div>
      {elsewhere.length > 0 && (
        <ul className="space-y-0.5 pr-4 pb-2 pl-10 text-small text-ink">
          {elsewhere.map((c, i) => (
            <li key={`${c.kind}-${i}`}>{c.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The lines of each row, worked out once per proposal and record type, not once per row.
const linesCache = new WeakMap<ProposalInfo, Map<string, Map<string, ProposalChange[]>>>();

function linesByField(info: ProposalInfo, type: RecordType): Map<string, ProposalChange[]> {
  let byType = linesCache.get(info);
  if (!byType) linesCache.set(info, (byType = new Map()));
  const cached = byType.get(type.id);
  if (cached) return cached;
  const proposed = proposedType(info, type);
  const lines = new Map<string, ProposalChange[]>();
  for (const c of info.changes) {
    if ((c.kind !== "changed-field" && c.kind !== "removed-field") || !inType(c, type, proposed))
      continue;
    const id = rowFieldId(c, type, proposed);
    if (id != null) lines.set(id, [...(lines.get(id) ?? []), c]);
  }
  byType.set(type.id, lines);
  return lines;
}

/** The changes proposed to one existing field, as lines under its row. */
export function ProposalLines({ field }: { field: FieldDef }) {
  const { proposal, selectedTypeId } = useWorkspace();
  const info = proposal as ProposalInfo | null;
  const type = info?.current.recordTypes.find((t) => t.id === selectedTypeId);
  const all = info && type ? linesByField(info, type) : null;
  const lines = all?.get(field.id) ?? [];
  const isFirst = !!all && all.keys().next().value === field.id;
  const list = useRef<HTMLUListElement>(null);
  const messageId = info?.messageId ?? null;
  // A new proposal brings its first changed row into view: the table may be taller than the room left.
  useEffect(() => {
    if (isFirst) list.current?.scrollIntoView({ block: "nearest" });
  }, [isFirst, messageId]);
  if (lines.length === 0) return null;
  return (
    <ul ref={list} className="space-y-1 pr-4 pb-2.5 pl-8">
      {lines.map((c, i) => (
        <li
          key={`${c.kind}-${i}`}
          className="rounded-control bg-surface-tint py-1.5 pr-2.5 pl-2.5 text-small text-ink"
        >
          <strong
            className={
              c.kind === "removed-field" ? "font-semibold text-danger" : "font-semibold text-link"
            }
          >
            {c.kind === "removed-field" ? "Remove" : "Change"}
          </strong>{" "}
          {lineText(c)}
        </li>
      ))}
    </ul>
  );
}

/** The fields proposed for the record type, as table rows (`tr`) marked "New field". */
export function ProposedFieldRows({ typeId }: { typeId: string }) {
  const { proposal } = useWorkspace();
  const info = proposal as ProposalInfo | null;
  const type = info?.current.recordTypes.find((t) => t.id === typeId);
  const first = useRef<HTMLTableRowElement>(null);
  const firstId = info?.messageId ?? null;
  // A new proposal brings its first new row into view: the table may be taller than the room left.
  useEffect(() => {
    first.current?.scrollIntoView({ block: "nearest" });
  }, [firstId]);
  if (!info || !type) return null;
  const proposed = proposedType(info, type);
  const fields = info.changes
    .filter((c) => c.kind === "added-field" && inType(c, type, proposed))
    .map((c) => proposed?.fields.find((f) => f.id === c.fieldId))
    .filter((f): f is FieldDef => !!f);
  return (
    <>
      {fields.map((f, i) => (
        <ProposedFieldRow key={f.id} field={f} rowRef={i === 0 ? first : undefined} />
      ))}
    </>
  );
}

/** One proposed field as a read-only table row (`tr`) marked "New field". */
function ProposedFieldRow({
  field: f,
  rowRef,
}: {
  field: FieldDef;
  rowRef?: React.Ref<HTMLTableRowElement>;
}) {
  return (
    <tr ref={rowRef} className="block border-b border-border-subtle bg-surface-tint">
      <td className="block py-2.5 pr-4 pl-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span aria-hidden className="size-2 shrink-0 rounded-pill border-2 border-ink-muted" />
          <span className="font-medium text-ink">{f.name.trim() || f.key}</span>
          <span className="rounded-pill bg-success-soft px-2 text-caption font-semibold text-success">
            New field
          </span>
          <span className="text-caption text-ink-muted">
            {TYPE_LABEL[f.valueType]} · {f.mode === "quote" ? "exact quote" : "worked out"}
            {f.multiple ? " · several values" : ""}
          </span>
        </div>
        {f.description.trim() !== "" && (
          <p className="mt-0.5 ml-4 text-small text-ink-muted">{f.description}</p>
        )}
      </td>
    </tr>
  );
}

/**
 * The record types the proposal adds, each as a table of its own: the name marked "New record
 * type", then its fields as rows marked "New field". It is how a proposal looks while the
 * configuration is still empty, and it sits under the field table otherwise.
 */
export function ProposedTypes() {
  const { proposal } = useWorkspace();
  const info = proposal as ProposalInfo | null;
  if (!info) return null;
  const types = info.changes
    .filter((c) => c.kind === "added-type")
    .map((c) => info.proposal.definition.recordTypes.find((t) => t.id === c.typeId))
    .filter((t): t is RecordType => !!t);
  return (
    <>
      {types.map((t, i) => (
        <table key={`${t.id}-${i}`} className="block w-full">
          <caption className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-subtle bg-surface-tint py-2 pr-4 pl-4 text-left">
            <span className="font-semibold text-ink-heading">{t.name.trim() || "Record type"}</span>
            <span className="rounded-pill bg-success-soft px-2 text-caption font-semibold text-success">
              New record type
            </span>
            <span className="text-caption text-ink-muted">{plural(t.fields.length, "field")}</span>
          </caption>
          <tbody className="block">
            {t.fields.length === 0 ? (
              <tr className="block border-b border-border-subtle bg-surface-tint">
                <td className="block py-2.5 pr-4 pl-4 text-small text-ink-muted">No fields.</td>
              </tr>
            ) : (
              t.fields.map((f) => <ProposedFieldRow key={f.id} field={f} />)
            )}
          </tbody>
        </table>
      ))}
    </>
  );
}
