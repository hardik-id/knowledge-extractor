"use client";

import { createWorkspaceRunStore } from "@/store/pipeline-store";

/**
 * The shell's parts (the connection banner, the backend status) read a run store, and every app
 * brings its own. Access has no run: this one never opens a workspace and keeps nothing in the
 * browser.
 */
export const accessRunStore = createWorkspaceRunStore("knowledge-access:none");
