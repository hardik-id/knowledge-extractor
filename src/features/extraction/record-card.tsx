"use client";

import { BookmarkCheck, Check, RotateCcw, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ExtractionRecord, RecordType } from "@/services/contracts";
import type { ExtractionActions } from "@/features/run/use-extraction";
import type { FieldLabel } from "./labels";
import { HumanMarker, ReviewStateLabel } from "./record-review-state";
import { EmptyValue, ValueRow } from "./record-value";

export interface RecordCardProps {
  record: ExtractionRecord;
  type: RecordType | null;
  number: number;
  labels: Map<string, FieldLabel>;
  marked: ReadonlySet<string>;
  unanchored: ReadonlySet<string>;
  activeValueId: string | null;
  activeRecordId: string | null;
  onSelectValue: (record: ExtractionRecord, value: ExtractionRecord["fields"][number]) => void;
  onSelectRecord: (record: ExtractionRecord) => void;
  actions?: ExtractionActions;
  readOnly?: boolean;
}

export function RecordActions({
  record,
  actions,
}: {
  record: ExtractionRecord;
  actions: ExtractionActions;
}) {
  const [confirming, setConfirming] = useState(false);
  const { pending } = actions;
  const set = (review: ExtractionRecord["review"]) => actions.updateRecord(record.id, { review });

  if (confirming) {
    return (
      <div
        role="group"
        aria-label="Delete this record?"
        className="flex flex-wrap items-center gap-1"
      >
        <span className="text-small text-ink">Delete this record?</span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={pending}
          onClick={async () => {
            const ok = await actions.deleteRecord(record.id);
            if (!ok) setConfirming(false);
          }}
        >
          <Trash2 aria-hidden />
          Delete
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          autoFocus
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {record.review === "suggested" ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() => set("accepted")}
          >
            <Check aria-hidden />
            Accept
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={() => set("rejected")}
          >
            <X aria-hidden />
            Reject
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={pending}
          onClick={() => set("suggested")}
        >
          <RotateCcw aria-hidden />
          Undo
        </Button>
      )}
      {record.origin === "human" && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
          Delete
        </Button>
      )}
    </div>
  );
}

export function ExampleToggle({
  record,
  actions,
}: {
  record: ExtractionRecord;
  actions: ExtractionActions;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={record.useAsExample}
        disabled={actions.pending}
        aria-describedby={`${id}-help`}
        onCheckedChange={(checked) =>
          void actions.updateRecord(record.id, { useAsExample: checked === true })
        }
      />
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-small font-semibold text-ink">
          Use as an example
        </label>
        <p id={`${id}-help`} className="text-caption text-ink-muted">
          Later extraction runs show this record to the model as an example of what you want.
        </p>
      </div>
    </div>
  );
}

export function RecordCard({
  record,
  type,
  number,
  labels,
  marked,
  unanchored,
  activeValueId,
  activeRecordId,
  onSelectValue,
  onSelectRecord,
  actions,
  readOnly,
}: RecordCardProps) {
  const editable = !!actions && !readOnly;
  const fieldIds = type?.fields.map((f) => f.id) ?? [];
  // Fields in definition order, then anything the definition no longer has.
  const orderedIds = [
    ...fieldIds,
    ...new Set(record.fields.map((v) => v.fieldId).filter((id) => !fieldIds.includes(id))),
  ].filter((id) => labels.has(id));

  const first = fieldIds.length > 0 ? record.fields.find((v) => v.fieldId === fieldIds[0]) : null;
  const heading = first?.value?.trim() || `${type?.name ?? "Record"} ${number}`;
  const selected = activeRecordId === record.id;
  const collapsed = editable && record.review === "rejected";

  return (
    <article
      data-record={record.id}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "border-b border-l-2 border-b-border-subtle px-4 py-3",
        selected ? "border-l-ink-heading bg-surface-tint" : "border-l-transparent",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4
          className={cn(
            "min-w-0 flex-1 basis-32 text-body font-semibold text-ink-heading",
            collapsed && "font-normal text-ink-muted",
          )}
        >
          <button
            type="button"
            onClick={() => onSelectRecord(record)}
            className="line-clamp-2 rounded-control text-left break-words hover:underline"
          >
            {heading}
          </button>
        </h4>
        <ReviewStateLabel state={record.review} />
        {editable && <RecordActions record={record} actions={actions} />}
      </header>
      {((editable && record.origin === "human") || record.useAsExample) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {editable && record.origin === "human" && <HumanMarker text="Added by you" />}
          {record.useAsExample && (
            <span className="inline-flex items-center gap-1 text-caption text-ink-muted">
              <BookmarkCheck aria-hidden className="size-3 shrink-0" />
              Example
            </span>
          )}
        </p>
      )}
      {editable && record.review === "accepted" && (
        <div className="mt-2">
          <ExampleToggle record={record} actions={actions} />
        </div>
      )}

      {!collapsed && (
        <dl className="mt-2 grid grid-cols-[6.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          {orderedIds.map((fieldId) => {
            const label = labels.get(fieldId)!;
            const values = record.fields.filter((v) => v.fieldId === fieldId);
            return (
              <div key={fieldId} className="col-span-2 grid grid-cols-subgrid items-start">
                <dt className="pt-0.5">
                  <span
                    title={label.field.name}
                    className={cn(
                      "inline-block max-w-full truncate rounded-pill border px-1.5 align-top text-caption font-semibold",
                      label.style.chip,
                    )}
                  >
                    {label.field.name}
                  </span>
                </dt>
                <dd className="flex min-w-0 flex-col gap-1">
                  {values.length === 0 ? (
                    <EmptyValue
                      record={record}
                      siblings={values}
                      field={label.field}
                      actions={actions}
                      readOnly={readOnly}
                    />
                  ) : (
                    values.map((value) => (
                      <ValueRow
                        key={value.id}
                        record={record}
                        value={value}
                        siblings={values}
                        label={label}
                        canSelect={marked.has(value.id)}
                        unanchored={unanchored.has(value.id)}
                        active={activeValueId === value.id}
                        onSelect={() => onSelectValue(record, value)}
                        actions={actions}
                        readOnly={readOnly}
                      />
                    ))
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </article>
  );
}
