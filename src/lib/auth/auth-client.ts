/**
 * Sign-in, as the rest of the app sees it. The identity provider's library
 * (MSAL for Microsoft Entra ID) stays behind this interface, so nothing else
 * imports it and a pretend client can stand in for it.
 *
 * Implementations touch browser globals only inside their methods: the module
 * that creates one is also evaluated on the server.
 */

export interface AuthAccount {
  /** Stable id of the person: "<tenant id>.<object id>". Never an email address. */
  id: string;
  /** Name to show, e.g. "Ada Lovelace". */
  name: string;
  /** Sign-in name, usually an email address. For display only. */
  username: string;
}

/** What `init()` found when the page loaded. */
export type AuthInitResult =
  | { status: "signed-in"; account: AuthAccount }
  /** No session in this tab. */
  | { status: "signed-out" }
  /** A sign-in attempt came back with an error (cancelled, consent missing, wrong setup). */
  | { status: "error"; message: string };

/** `signInAgain()` could not open its window, or the person closed it. */
export class SignInWindowError extends Error {
  constructor(message = "The sign-in window was blocked or closed.") {
    super(message);
    this.name = "SignInWindowError";
  }
}

export interface AuthClient {
  /**
   * Call once when the app loads, before anything else. Finishes a sign-in
   * that is returning from the identity provider and says who is signed in.
   * Never rejects: a failure is the "error" result.
   */
  init(): Promise<AuthInitResult>;

  /**
   * Sign in by leaving the page for the identity provider. The person comes
   * back to the page they started on, where `init()` finishes the sign-in.
   * The returned promise settles only if the navigation could not start.
   */
  signIn(): Promise<void>;

  /**
   * Sign in again in a separate window, keeping this page and its unsaved
   * work. Rejects with `SignInWindowError` when the window is blocked or
   * closed, and with the original error for anything else.
   */
  signInAgain(): Promise<AuthAccount>;

  /**
   * Sign out here and at the identity provider, and tell this person's other
   * tabs. Leaves the page.
   */
  signOut(): Promise<void>;

  /**
   * The access token for the backend, renewed silently when needed.
   * Resolves to null when the person has to sign in again. Rejects when the
   * token could not be fetched for another reason (the network is down): that
   * is not a sign-out.
   */
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string | null>;

  /** Called when the person signs out in another tab. Returns a function that stops listening. */
  onSignedOutElsewhere(listener: () => void): () => void;
}
