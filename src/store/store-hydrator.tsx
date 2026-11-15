"use client";

import { useEffect } from "react";
import { usePipelineStore } from "./pipeline-store";

/** Reads the persisted run from sessionStorage once, after the first client render. */
export function StoreHydrator() {
  useEffect(() => {
    void usePipelineStore.persist.rehydrate();
  }, []);
  return null;
}
