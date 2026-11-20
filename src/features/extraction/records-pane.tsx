"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ExtractionActions } from "@/features/run/use-extraction";
import type {
  ExtractionDefinition,
  ExtractionRecord,
  FieldValue,
  RecordType,
} from "@/services/contracts";
import type { FieldLabel } from "./labels";
import { RecordCard } from "./record-card";
import { countReviews, reviewSummary, sortRejectedLast, suggestedRecordIds } from "./record-rules";

export { ReviewStateLabel } from "./record-review-state";

export interface RecordsPaneProps {
  definition: ExtractionDefinition;
  records: ExtractionRecord[];
  labels: Map<string, FieldLabel>;
  /** Values that have a highlight in the document: only these can be selected. */
  marked: ReadonlySet<string>;
  /** Values whose quote is not in the text. */
  unanchored: ReadonlySet<string>;
  activeValueId: string | null;
  activeRecordId: string | null;
  onSelectValue: (record: ExtractionRecord, value: FieldValue) => void;
  onSelectRecord: (record: ExtractionRecord) => void;
  /** Changes to the records. Without it, or with `readOnly`, the pane only shows them. */
  actions?: ExtractionActions;
  readOnly?: boolean;
}

/** "3 records · 1 value not found in text" */
export function recordsSummary(recordCount: number, unanchoredCount: number): string {
  const records = `${recordCount} ${recordCount === 1 ? "record" : "records"}`;
  if (unanchoredCount === 0) return records;
  return `${records} · ${unanchoredCount} ${unanchoredCount === 1 ? "value" : "values"} not found in text`;
}

interface Group {
  key: string;
  type: RecordType | null;
  records: { record: ExtractionRecord; number: number }[];
}

function groupRecords(definition: ExtractionDefinition, records: ExtractionRecord[]): Group[] {
  const groups = new Map<string, Group>();
  for (const type of definition.recordTypes) {
    groups.set(type.id, { key: type.id, type, records: [] });
  }
  for (const record of records) {
    let group = groups.get(record.recordTypeId);
    if (!group) {
      group = { key: record.recordTypeId, type: null, records: [] };
      groups.set(record.recordTypeId, group);
    }
    group.records.push({ record, number: group.records.length + 1 });
  }
  return [...groups.values()].filter((g) => g.records.length > 0);
}

/** The records of one file as cards, grouped by record type when there is more than one type. */
export function RecordsPane({ definition, records, unanchored, ...rest }: RecordsPaneProps) {
  const { actions, readOnly } = rest;
  const editable = !!actions && !readOnly;
  const groups = groupRecords(definition, records).map((g) =>
    editable ? { ...g, records: sortRejectedLast(g.records) } : g,
  );
  const showTypes = groups.length > 1;
  const counts = countReviews(records);

  // The newest records and actions, for the loop in "Accept all suggested".
  const latest = useRef({ records, actions });
  useEffect(() => {
    latest.current = { records, actions };
  });
  const [accepting, setAccepting] = useState(false);

  /**
   * Accepts the suggested records one after another. Each change is sent with
   * the revision of the records on screen, so after one succeeds this waits
   * until the new records have been rendered (and the actions with them)
   * before sending the next. It stops at the first failure or if the new
   * records do not arrive.
   */
  const acceptAll = async () => {
    setAccepting(true);
    try {
      for (const id of suggestedRecordIds(latest.current.records)) {
        const current = latest.current.actions;
        if (!current) return;
        if (!(await current.updateRecord(id, { review: "accepted" }))) return;
        const deadline = Date.now() + 3000;
        while (
          latest.current.records.find((r) => r.id === id)?.review === "suggested" &&
          Date.now() < deadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        if (latest.current.records.find((r) => r.id === id)?.review === "suggested") return;
      }
    } finally {
      setAccepting(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border-subtle bg-background px-4 py-2">
        <p className="text-small text-ink-muted tabular-nums">
          {recordsSummary(records.length, unanchored.size)}
          {editable && records.length > 0 && <> · {reviewSummary(counts)}</>}
        </p>
        {editable && counts.suggested > 0 && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={actions.pending || accepting}
            onClick={acceptAll}
          >
            <Check aria-hidden />
            Accept all suggested
          </Button>
        )}
      </div>
      {records.length === 0 ? (
        <p className="p-4 text-body text-ink">Nothing was found in this file.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            {showTypes && (
              <h3 className="border-b border-border-subtle bg-surface-tint px-4 py-1 text-small font-semibold text-ink-heading">
                {group.type?.name ?? "Other records"}{" "}
                <span className="font-normal text-ink-muted tabular-nums">
                  ({group.records.length})
                </span>
              </h3>
            )}
            <ul>
              {group.records.map(({ record, number }) => (
                <li key={record.id}>
                  <RecordCard
                    record={record}
                    type={group.type}
                    number={number}
                    unanchored={unanchored}
                    {...rest}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </TooltipProvider>
  );
}
