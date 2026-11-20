"use client";

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { isUnauthorized } from "@/lib/api/api-error";
import { appSession } from "@/lib/auth/session-signal";

export interface AsyncData<T> {
  /**
   * The latest result. While `isLoading` it can still belong to the previous
   * key: show it dimmed, or ignore it, whichever suits the view.
   */
  data: T | undefined;
  /** Set when the request for the current key failed. */
  error: unknown;
  isLoading: boolean;
  retry: () => void;
}

interface Settled<T> {
  key: string;
  attempt: number;
  data?: T;
  error?: unknown;
}

/** A Map that drops its oldest entry once it is full. Pass one to `useAsyncData` to cache results. */
export class BoundedCache<T> extends Map<string, T> {
  private readonly maxEntries: number;

  constructor(maxEntries: number) {
    super();
    this.maxEntries = maxEntries;
  }

  override set(key: string, value: T): this {
    if (!this.has(key) && this.size >= this.maxEntries) {
      const oldest = this.keys().next();
      if (!oldest.done) this.delete(oldest.value);
    }
    return super.set(key, value);
  }
}

/**
 * Loads data for a read-only view: fetches when `key` changes, cancels the
 * request that is no longer wanted, and never lets a slow old response replace
 * a newer one. A `null` key means "nothing to load yet".
 *
 * A load refused with a 401 is not an error to show: the session has ended and
 * the app has one place to sign in again. While it is ended the load counts as
 * still loading, and it runs again by itself when the session resumes.
 *
 * Give a `cache` only when a key always means the same data (for example a key
 * that contains an ETag).
 */
export function useAsyncData<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  cache?: Map<string, T>,
): AsyncData<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const load = useEffectEvent(fetcher);
  const sessionEnded = useSyncExternalStore(appSession.subscribe, appSession.isEnded, () => false);

  const isCached = key !== null && cache !== undefined && cache.has(key);

  useEffect(() => {
    if (key === null || isCached) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        cache?.set(key, data);
        setSettled({ key, attempt, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSettled({ key, attempt, error });
      },
    );
    return () => controller.abort();
  }, [key, attempt, isCached, cache]);

  const retry = () => setAttempt((n) => n + 1);

  // Signed in again: a load that was refused runs again, with no "Try again" to press.
  const onResume = useEffectEvent(() => {
    if (settled?.key === key && settled.attempt === attempt && isUnauthorized(settled.error))
      retry();
  });
  useEffect(() => appSession.onResume(() => onResume()), []);

  if (isCached) return { data: cache.get(key), error: undefined, isLoading: false, retry };

  const isCurrent = settled !== null && settled.key === key && settled.attempt === attempt;
  const error = isCurrent ? settled.error : undefined;
  if (sessionEnded && isUnauthorized(error)) {
    return { data: settled?.data, error: undefined, isLoading: true, retry };
  }
  return { data: settled?.data, error, isLoading: key !== null && !isCurrent, retry };
}
