"use client";

import { useEffect, useRef, useState } from "react";
import type { ExtractionActions } from "@/features/run/use-extraction";
import type { ExtractionRecord } from "@/services/contracts";
import { suggestedRecordIds } from "./record-rules";

/**
 * "Accept all suggested": accepts the suggested records one after another.
 * Each change is sent with the revision of the records on screen, so after one
 * succeeds this waits until the new records have been rendered (and the
 * actions with them) before sending the next. It stops at the first failure or
 * if the new records do not arrive.
 */
export function useAcceptAll(
  records: ExtractionRecord[],
  actions: ExtractionActions | undefined,
): { acceptAll: () => Promise<void>; accepting: boolean } {
  // The newest records and actions, for the loop.
  const latest = useRef({ records, actions });
  useEffect(() => {
    latest.current = { records, actions };
  });
  const [accepting, setAccepting] = useState(false);

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

  return { acceptAll, accepting };
}
