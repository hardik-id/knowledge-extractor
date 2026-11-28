"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toastFailure } from "@/features/auth/report-failure";
import { appSession } from "@/lib/auth/session-signal";
import { services } from "@/services";
import type { BackendStatus } from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";
import { createStatusStore, type StatusSnapshot } from "./status-store";
import { withSocketState } from "./status-rules";

/** The app's one status store: every badge reads it. */
const statusStore = createStatusStore(services.status, appSession, (error) =>
  toastFailure("Couldn't test the connections", error, undefined, false),
);

const EMPTY: StatusSnapshot = { status: undefined, failed: false, testing: false, tested: null };

/** `status` is null when the backend does not report it, undefined until it has answered. */
export interface BackendStatusView {
  status: BackendStatus | null | undefined;
  failed: boolean;
  loading: boolean;
  testing: boolean;
  cachedAnswer: boolean;
  /** When the test answered (ms), for "checked N seconds ago". */
  testedAt: number | null;
  /** Reads it again: the panel calls this each time it opens. */
  refresh: () => void;
  test: () => void;
}

/**
 * The backend's status for a badge. The load is shared (see `createStatusStore`): when the app
 * opens, and each time a panel opens. "Live updates" follows this browser's own socket while a
 * run is open.
 */
export function useBackendStatus(): BackendStatusView {
  const snapshot = useSyncExternalStore(
    statusStore.subscribe,
    statusStore.getSnapshot,
    () => EMPTY,
  );
  const connection = usePipelineStore((s) => (s.runId ? s.connection : "idle"));
  const sessionEnded = useSyncExternalStore(appSession.subscribe, appSession.isEnded, () => false);
  useEffect(() => statusStore.ensureLoaded(), []);

  const { status } = snapshot;
  return {
    status: status ? withSocketState(status, connection, sessionEnded) : status,
    failed: snapshot.failed && status === undefined,
    loading: status === undefined && !snapshot.failed,
    testing: snapshot.testing,
    cachedAnswer: snapshot.tested?.cached ?? false,
    testedAt: snapshot.tested?.at ?? null,
    refresh: statusStore.refresh,
    test: statusStore.test,
  };
}
