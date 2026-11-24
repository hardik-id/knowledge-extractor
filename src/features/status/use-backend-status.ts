"use client";

import { useState } from "react";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { BackendStatus } from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";
import { toastFailure } from "@/features/auth/report-failure";
import { withSocketState } from "./status-rules";

/** `status` is null when the backend does not report it, undefined until it has answered. */
export interface BackendStatusView {
  status: BackendStatus | null | undefined;
  /** The status could not be read (not a 404: that is "not reported"). */
  failed: boolean;
  loading: boolean;
  testing: boolean;
  /** Set after a test that the backend answered from its stored result. */
  cachedAnswer: boolean;
  /** When the test answered (ms), for "checked N seconds ago". */
  testedAt: number | null;
  /** Reads it again: the panel calls this each time it opens. */
  refresh: () => void;
  test: () => void;
}

/**
 * The backend's status for the top bar. It loads when the bar mounts and again each time the
 * panel opens (`refresh`): no polling. A 401 is the session's business (`useAsyncData`). The
 * "Live updates" row follows this browser's own socket while a run is open.
 */
export function useBackendStatus(): BackendStatusView {
  const [round, setRound] = useState(0);
  const [tested, setTested] = useState<{
    status: BackendStatus;
    cached: boolean;
    at: number;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const connection = usePipelineStore((s) => (s.runId ? s.connection : "idle"));

  const { data, error, isLoading } = useAsyncData(`status:${round}`, (signal) =>
    services.status.get(signal),
  );

  const fresh = tested?.status ?? data;
  const status = fresh ? withSocketState(fresh, connection) : fresh;

  return {
    status,
    failed: error !== undefined && data === undefined && tested === null,
    loading: isLoading && data === undefined,
    testing,
    cachedAnswer: tested?.cached ?? false,
    testedAt: tested?.at ?? null,
    refresh: () => {
      setTested(null);
      setRound((n) => n + 1);
    },
    test: () => {
      if (testing) return;
      setTesting(true);
      services.status.test().then(
        (result) => {
          setTesting(false);
          if (result) setTested({ ...result, at: Date.now() });
          else setRound((n) => n + 1);
        },
        (failure: unknown) => {
          setTesting(false);
          toastFailure("Couldn't test the connections", failure);
        },
      );
    },
  };
}
