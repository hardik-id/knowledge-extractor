"use client";

import { useEffect } from "react";
import { useRunStoreApi } from "./use-run-store";

/** Reads the persisted run from sessionStorage once, after the first client render. */
export function StoreHydrator() {
  const store = useRunStoreApi();
  useEffect(() => {
    void store.persist.rehydrate();
  }, [store]);
  return null;
}
