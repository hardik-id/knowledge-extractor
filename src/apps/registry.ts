/**
 * The apps the shell hosts. Each app owns a route prefix, its own run store
 * and a folder for its own code (`src/apps/<id>/`). Pure data, so the proxy,
 * tests and server components can import it. Icons live in `icons.ts`.
 */

// Relative imports: next.config.ts loads this file and cannot resolve the "@/" alias.
import { env } from "../config/env";
import { APP_IDS, type AppId } from "./app-ids";

export { APP_IDS, type AppId };

export interface AppInfo {
  id: AppId;
  name: string;
  /** One short sentence, shown in the app switcher. */
  description: string;
  /** Where the switcher sends you: the app's first page. */
  href: string;
  /** Experimental apps get a badge in the switcher. */
  experimental: boolean;
}

export const ALL_APPS: readonly AppInfo[] = [
  {
    id: "pipeline",
    name: "Knowledge Extractor",
    description: "Run documents through the full pipeline, from selection to index.",
    href: "/pipeline/select",
    experimental: false,
  },
  {
    id: "studio",
    name: "Knowledge Studio",
    description: "Extract and review knowledge from documents already in storage.",
    href: "/studio",
    experimental: true,
  },
];

/** The apps named by `ids`, in that order. */
export function offeredApps(ids: readonly AppId[], all: readonly AppInfo[] = ALL_APPS): AppInfo[] {
  return ids.map((id) => all.find((app) => app.id === id)!);
}

/** The apps this deployment offers (`NEXT_PUBLIC_APPS`), in order. */
export const APPS: readonly AppInfo[] = offeredApps(env.apps);

export function getApp(id: AppId): AppInfo {
  return ALL_APPS.find((app) => app.id === id)!;
}

/** The first offered app: where `/` goes. */
export const FIRST_APP: AppInfo = APPS[0];

/** True when `pathname` is under an app this deployment does not offer. */
export function isHiddenAppPath(pathname: string, offered: readonly AppInfo[] = APPS): boolean {
  const owner = appForPath(pathname, ALL_APPS);
  return owner !== undefined && !offered.some((app) => app.id === owner.id);
}

/** The offered app whose route prefix matches `pathname`, if any. `/studio-x` is not `/studio`. */
export function appForPath(pathname: string, apps: readonly AppInfo[] = APPS): AppInfo | undefined {
  return apps.find((app) => pathname === `/${app.id}` || pathname.startsWith(`/${app.id}/`));
}
