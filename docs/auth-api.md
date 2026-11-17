# Sign-in: what the backend needs

The UI signs people in with Microsoft Entra ID. This page is what the backend has to set up and check. It covers the app registration, the token checks, errors, CORS and the WebSocket ticket. The backend may be Django or something else, and may or may not have a WebSocket. Everything here holds either way.

The UI side is `src/lib/auth/`, `src/services/auth.ts` and `src/features/auth/`. The HTTP client attaches the token in `src/lib/api/`. If the backend has to differ, change this document and those places together.

Status: the UI uses every section. Placeholders in angle brackets (`<tenant-id>`, `<client-id>`) are values from your own app registration.

## How it works

- The browser signs the person in with Microsoft's `@azure/msal-browser` library (version 5). It uses the authorization code flow with Proof Key for Code Exchange (PKCE), by redirect. The Next.js server takes no part.
- The tokens live in the browser's `sessionStorage`. Each tab signs in on its own.
- One app registration serves the UI and the backend. The UI asks for one scope, `api://<client-id>/access_as_user`.
- The UI sends the access token on **every REST call** as `Authorization: Bearer <token>`.
- The backend reads who the person is from the token's claims and applies **its own permissions**. There is no on-behalf-of exchange, and no per-person access to the storage container. The backend reads storage with its own identity.
- Sign-in returns to `<origin>/auth/redirect`. Sign-out returns to `<origin>/`.

## 1. App registration

In the Microsoft Entra admin centre, under App registrations:

1. Create one registration. Supported account types: **single tenant** (this directory only).
2. Under Authentication, add the platform **Single-page application**. Not "Web": a "Web" platform expects a client secret and the sign-in fails.
3. Add these redirect URIs, and the same two on the production host:
   - `http://localhost:3000/auth/redirect`
   - `http://localhost:3000/`
4. Do not create a client secret. Do not enable the implicit grant.
5. Under Expose an API, set the Application ID URI to `api://<client-id>`.
6. Add a scope named `access_as_user`. Who can consent: admins and users. Give it a short consent title and text.
7. In the manifest, set `requestedAccessTokenVersion` to `2` (older manifests call it `accessTokenAcceptedVersion`). If this is missed, Entra issues version 1 tokens. Their issuer is `https://sts.windows.net/<tenant-id>/` and their audience is `api://<client-id>`, so the checks in section 2 fail on every call.
8. On the enterprise application (same name, under Enterprise applications), set **Assignment required** to Yes and assign the people or groups who may use the app. Recommended: without it, anyone in the tenant can sign in and get a token, and only the backend's own permissions stand between them and the data.

Admin consent is not needed by this design. Grant it only if the tenant blocks user consent, or if a consent prompt appears when people sign in.

## 2. What the backend checks on every call

| Check     | Rule                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Signature | valid against the tenant's signing keys (the `jwks_uri` in the OpenID configuration)                  |
| Expiry    | `exp` is in the future (allow a little clock skew)                                                    |
| Issuer    | `iss` is `https://login.microsoftonline.com/<tenant-id>/v2.0`, and its tenant matches the `tid` claim |
| Audience  | `aud` equals the client id, `<client-id>`                                                             |
| Scope     | `scp` contains `access_as_user`. A token with no `scp` is refused                                     |

The OpenID configuration is at `https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration`. Cache the keys and fetch them again when a token names a key you don't have.

### Who the person is

The person is the claim `oid` together with `tid`. Never use an email address or `preferred_username`: they can change, and they are not unique.

Claims available without extra setup:

| Claim                | Meaning                                            |
| -------------------- | -------------------------------------------------- |
| `oid`                | the person's object id in the directory. Stable    |
| `tid`                | the tenant id                                      |
| `name`               | display name. Show it, don't key on it             |
| `preferred_username` | usually the sign-in name. Show it, don't key on it |
| `scp`                | the scopes the token grants, space separated       |

App roles can be added to the registration later if the backend wants roles in the token (see the questions below).

## 3. Permissions are the backend's own

- On every call the backend decides what this person may list, open and change. The token proves who they are. It does not say what they may do.
- Runs and their results are visible only to whoever the backend allows (for example the person who started the run).
- An id the person may not see should answer **404**, not 403, so the answer does not reveal that it exists. Use 403 where the person already knows it is there and may not act on it.

## 4. Errors

Same body as the other documents: `{ "code": "…", "message": "…" }`. A Django REST Framework `{ "detail": "…" }` is also read.

| Status | Code              | When                                                           |
| ------ | ----------------- | -------------------------------------------------------------- |
| 401    | `unauthenticated` | the token is missing, expired or invalid                       |
| 403    | `forbidden`       | the token is valid, but this person has no access to the thing |

What the UI does on a 401: it asks Microsoft for a fresh token once and sends the call again. If that call is refused too, the session has ended. The UI keeps the page and shows a dialog asking the person to sign in again, in a separate window so unsaved work is kept. A 403 is shown as an error on the call. It does not sign anyone out.

## 5. CORS

If the UI and the API are on different origins, the API must:

- allow the UI's origin (`http://localhost:3000` in development, the production host in production);
- allow the `Authorization` header, and `Content-Type` and `X-Request-ID`, which the UI also sends;
- expose `ETag`, so the browser lets the UI read it (see studio-api.md, section 3).

Do not use `*` as the origin together with credentials. The UI sends no cookies; the token is in the header.

## 6. WebSocket ticket

Only if the backend has a WebSocket. A browser can't set a header on a socket, so the UI cannot send the bearer token there.

`POST /ws-ticket` (authenticated like any other call, no body) returns:

```json
{ "ticket": "k3J…" }
```

- The ticket is **single-use**, **short-lived** (seconds) and **tied to the person** who asked for it.
- The UI puts it in the socket URL: `<ws-base>/ws/runs/{run_id}/?ticket=<ticket>`. It asks for a new ticket each time it opens or reopens a socket.
- The socket handler checks the ticket, that it is unused and not expired, and that this person may follow this run. Then it burns the ticket.
- A ticket is a secret in a URL. Keep it out of access logs, or log only the path.

Without a socket the UI does not call this endpoint, and nothing here is needed.

## 7. What sign-out does and does not do

- Sign-out clears the tokens in the browser, in every tab, and clears the UI's local data.
- Tokens already issued stay valid until they expire. The backend can't tell that the person signed out.
- So keep access tokens short-lived (Entra's default is about an hour), and do not issue long sessions of your own from them. Check the token on every call, not only at the first one.

## Open questions

- **Roles or groups.** Does the backend want app roles or group ids in the token, to decide what a person may do? Roles are set on the registration. Groups can make the token large for people in many groups.
- **Conditional Access.** A policy such as multi-factor authentication can make Entra ask for more proof. The API would answer 401 with a claims challenge. The UI treats that as an ended session for now, and asks for a sign-in again.
- **User record.** Does the backend keep its own user record, created the first time it sees an `oid`? Or does it only read the claims on each call?
