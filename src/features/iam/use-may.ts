"use client";

import { mayInWorkspace, type Permission } from "./permissions";
import { usePipelineStore } from "@/store/pipeline-store";

/**
 * May the person do this in the open workspace? It reads the workspace's own `permissions`, never
 * the role's name. Not loaded yet answers no. The API still checks every request: this only decides
 * what the screen offers.
 */
export function useMay(permission: Permission): boolean {
  return usePipelineStore((s) => mayInWorkspace(s.workspace, permission));
}
