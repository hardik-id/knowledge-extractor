/**
 * The apps the shell hosts. Each app owns a route prefix, its own run store
 * and a folder for its own code (`src/apps/<id>/`). Pure data, so the proxy,
 * tests and server components can import it. Icons live in `icons.ts`.
 */

export const APP_IDS = ["pipeline", "studio"] as const;
export type AppId = (typeof APP_IDS)[number];

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

export const APPS: readonly AppInfo[] = [
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

export function getApp(id: AppId): AppInfo {
  return APPS.find((app) => app.id === id)!;
}

/** The app whose route prefix matches `pathname`, if any. `/studio-x` is not `/studio`. */
export function appForPath(pathname: string): AppInfo | undefined {
  return APPS.find((app) => pathname === `/${app.id}` || pathname.startsWith(`/${app.id}/`));
}
