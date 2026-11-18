/** Every app the code contains. Kept apart so `config/env.ts` can check against it. */
export const APP_IDS = ["pipeline", "studio"] as const;
export type AppId = (typeof APP_IDS)[number];
