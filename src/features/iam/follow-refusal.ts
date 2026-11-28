"use client";

import { useEffect } from "react";
import { services } from "@/services";
import { useRunStoreApi } from "@/store/pipeline-store";
import { isRefusal } from "./refusal";

const listeners = new Set<() => void>();

/**
 * The API answered 403 `forbidden`: the person's role in the open workspace is not what the screen
 * thought. Whoever reports the failure calls this; the error itself is shown by them. Anything
 * else is ignored.
 */
export function followRefusal(error: unknown): void {
  if (!isRefusal(error)) return;
  listeners.forEach((listener) => listener());
}

/**
 * Inside an open workspace: after a refusal reads the workspace again, so the screen offers what
 * the role allows now. A workspace that cannot be read any more changes nothing here: the next
 * load says so.
 */
export function useFollowRefusal(): void {
  const store = useRunStoreApi();
  useEffect(() => {
    // Only the latest read counts: an older answer arriving last must not undo a newer one.
    let latest = 0;
    const again = () => {
      const { workspaceId, setWorkspace } = store.getState();
      if (!workspaceId) return;
      const mine = ++latest;
      services.workspaces.get(workspaceId).then(
        (workspace) => {
          if (mine === latest) setWorkspace(workspace);
        },
        () => {},
      );
    };
    listeners.add(again);
    return () => void listeners.delete(again);
  }, [store]);
}
