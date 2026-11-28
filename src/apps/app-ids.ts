/** Every app a deployment can choose among (`NEXT_PUBLIC_APPS`). Kept apart so `config/env.ts` can check against it. */
export const APP_IDS = ["pipeline", "studio"] as const;
export type OfferableAppId = (typeof APP_IDS)[number];

/** The Access app is part of every deployment: it is not in `NEXT_PUBLIC_APPS`, and only admins are shown it. */
export const ACCESS_APP_ID = "access";

export type AppId = OfferableAppId | typeof ACCESS_APP_ID;
