import { createAuthController } from "@/lib/auth/auth-controller";
import { createAuthFlags } from "@/lib/auth/auth-state";
import { authClient, authSession, clearLocalData } from "@/services";
import { resetAllRunStores } from "@/store/pipeline-store";

/** Reading `sessionStorage` can throw (blocked storage) and does not exist on the server. */
function sessionStorageOrNull(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** The one sign-in controller of the app; null when sign-in is off. */
export const authController =
  authClient && authSession
    ? createAuthController({
        client: authClient,
        tokens: authSession,
        flags: createAuthFlags(sessionStorageOrNull()),
        clearData: () => {
          resetAllRunStores();
          clearLocalData();
        },
      })
    : null;
