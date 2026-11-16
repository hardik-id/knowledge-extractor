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

function RecordActions({
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
        <span className="text-[13px] leading-[18px] text-ink">Delete this record?</span>
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

function ExampleToggle({
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
        <label htmlFor={id} className="text-[13px] leading-[18px] font-semibold text-ink">
          Use as an example
        </label>
        <p id={`${id}-help`} className="text-[12px] leading-4 text-ink-muted">
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
        "rounded-lg border bg-surface-raised p-3 shadow-card",
        selected ? "border-ink-heading ring-1 ring-ink-heading" : "border-border-subtle",
        collapsed && "bg-surface-tint",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h4
          className={cn(
            "min-w-0 text-[16px] leading-6 font-semibold text-ink-heading",
            collapsed && "font-normal text-ink-muted",
          )}
        >
          <button
            type="button"
            onClick={() => onSelectRecord(record)}
            className="line-clamp-2 rounded-sm text-left break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            {heading}
          </button>
        </h4>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {editable && record.origin === "human" && <HumanMarker text="Added by you" />}
          {record.useAsExample && (
            <span className="inline-flex items-center gap-1 text-[12px] leading-4 text-ink-muted">
              <BookmarkCheck aria-hidden className="size-3.5 shrink-0" />
              Example
            </span>
          )}
          <ReviewStateLabel state={record.review} />
        </span>
      </header>
      {editable && (
        <div className="mt-2">
          <RecordActions record={record} actions={actions} />
        </div>
      )}
      {editable && record.review === "accepted" && (
        <div className="mt-2">
          <ExampleToggle record={record} actions={actions} />
        </div>
      )}

      {!collapsed && (
        <dl className="mt-3 flex flex-col gap-3">
          {orderedIds.map((fieldId) => {
            const label = labels.get(fieldId)!;
            const values = record.fields.filter((v) => v.fieldId === fieldId);
            return (
              <div key={fieldId} className="flex flex-col items-start gap-1">
                <dt>
                  <span
                    className={cn(
                      "inline-block rounded-sm border px-1.5 text-[12px] leading-5 font-semibold",
                      label.style.chip,
                    )}
                  >
                    {label.field.name}
                  </span>
                </dt>
                <dd className="flex w-full flex-col gap-2">
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
