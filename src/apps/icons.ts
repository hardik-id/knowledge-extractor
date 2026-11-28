import { FlaskConical, KeyRound, Workflow, type LucideIcon } from "lucide-react";
import type { AppId } from "./registry";

/** Kept apart from the registry so the registry stays free of React-side imports. */
export const APP_ICONS: Record<AppId, LucideIcon> = {
  pipeline: Workflow,
  studio: FlaskConical,
  access: KeyRound,
};
