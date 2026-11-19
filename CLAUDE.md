@AGENTS.md

# Knowledge Extractor

A Next.js 16 (App Router, Cache Components) UI for a document pipeline:
**Select files → Ingest → Transform → Classify → Enrich → Extract → Index**.

## Design system: Polder

- Rules: `design/DESIGN.md`. Component guidelines: `design/components/*.md`. Values: `design/tokens.json`.
- Code uses the tokens through `src/app/globals.css` (CSS variables plus Tailwind utilities such as `bg-surface-tint`, `text-ink-heading`, `text-link`, `bg-action`).
- **Never use raw hex or Tailwind palette colours** (`text-blue-600`) in components. If a colour is missing, add a token to `design/tokens.json` and `globals.css` in the same change, with light and dark values that pass 4.5:1.
- One primary (orange) button per view. Status always pairs an icon with a word.
- Breakpoints are Polder's: `sm` 600px, `md` 960px, `lg` 1280px (they override Tailwind's defaults).

## Apps and branches

- One shell hosts several apps by route; a dropdown in the shell switches between them. `src/apps/registry.ts` lists them (id, name, description, href, `experimental`) and `appForPath(pathname)` finds the app a URL belongs to; icons are in `src/apps/icons.ts`. `components/layout/app-shell.tsx` is app-agnostic (`nav`, `mobileNav`, `navLabel`, `skipLabel`); each app's layout fills it.
- `NEXT_PUBLIC_APPS` (comma-separated ids, in the order to offer them; default every app) chooses which apps a deployment offers, checked in `config/env.ts`. `registry.ts` exports `ALL_APPS` (everything the code has) and `APPS` (the offered ones: the switcher, `appForPath`, `FIRST_APP`). `/` redirects to the first offered app (`next.config.ts`). With one app the switcher is a plain mark and name, and `proxy.ts` answers "not found" for the routes of an app that is not offered. Test code against `offeredApps(ids)` and the `apps` argument of `appForPath` / `isHiddenAppPath`, not by changing the environment.
- Each app has its own routes (`src/app/(apps)/<id>/`, a route group: its layout puts every app behind sign-in, and the URLs don't include `(apps)`), its own run store (`RunStoreProvider` in its layout) and its own folder for app-only code (`src/apps/<id>/`). Anything two apps both need is a shared component (`components/`, `features/file-picker`, `features/extraction`), not a copy and not an `if` on the app. Adding an app: an entry in the registry and the icon map, a route folder in `src/app/(apps)/` with a layout, a store, and a proxy matcher only if it needs one.
- Apps: **Knowledge Extractor** (`pipeline`, `/pipeline/[stage]`) and **Knowledge Studio** (`studio`, `/studio`, experimental): extraction only, over enriched Markdown documents in a storage container. Its documents come from `services.documents` and `catalog.list("storage")`; extraction reads the document by the run file's `sourceRef` and keeps its ETag as `sourceEtag`. What the backend has to provide is in `docs/studio-api.md`. Work happens in a project, which owns a run. Routes: `/studio` (the person's projects and "New project"), `/studio/projects/[id]` (Documents: pick, then "Open in extraction" sets the run's documents) and `/studio/projects/[id]/extract` (the extraction workspace, no stage sidebar or proceed footer, no Publish). The address decides the project and so the run: an unknown project, or someone else's, shows "This project no longer exists". Its code is in `src/apps/studio/`: `projects-entry.tsx`, `project-scope.tsx` (opens the project the address names), `studio-nav.tsx` (sidebar and mobile nav; addresses and rules in `nav-steps.ts`), `studio-panel.tsx` (the StagePanel look without "Stage N of M" or footer), `documents-panel.tsx`, `extract-page-content.tsx`.
- Trunk-based: everything merges to `main` through short-lived branches (`studio/<topic>` for studio work). Experiments live in `main` as their own app; dropping one means deleting its registry entry, its routes (`src/app/(apps)/<id>/`) and `src/apps/<id>/`.
- Backlog is GitHub issues. `track: studio` and the milestone "Knowledge Studio experiment" mark studio work, `track: shared` work that affects every app. Tracking issue #29.

## Sign-in

- Microsoft Entra ID, in the browser: `@azure/msal-browser` v5 (authorization code flow with Proof Key for Code Exchange, by redirect). The token is kept in `sessionStorage`, one sign-in per tab. The Next.js server takes no part. What the backend must set up and check is in `docs/auth-api.md`: keep it in step.
- `NEXT_PUBLIC_AUTH_MODE`: `none` (default, no sign-in; the dev token works in http mode), `entra` (sign-in for every app; needs `NEXT_PUBLIC_ENTRA_TENANT_ID` and `NEXT_PUBLIC_ENTRA_CLIENT_ID`; `NEXT_PUBLIC_ENTRA_API_SCOPE` is optional and defaults to `api://<client-id>/access_as_user`), `fake` (a pretend account for local checks; production builds refuse it). It is independent of `NEXT_PUBLIC_BACKEND_MODE`, so it works with the mock. A production build with `http` and without `entra` fails at build time.
- One app registration serves the UI and the backend. The UI sends the access token on every call as `Authorization: Bearer …`. The backend reads the person from the claims and applies its own permissions; there is no on-behalf-of exchange. Sign-in returns to `<origin>/auth/redirect`, sign-out to `<origin>/`.
- Code: `src/app/(apps)/layout.tsx` puts every app behind sign-in. With sign-in on it also renders a request-time marker (`await connection()` in `<Suspense>`): the gate keeps pages out of the prerendered HTML, and without the marker Next.js refuses to build `/pipeline/[stage]`, whose title depends on the URL. Check a change to that layout with a build in `entra` mode (placeholder ids are enough). `src/app/auth/redirect/` is outside the group: the page Microsoft returns to, which only runs MSAL's redirect bridge.
- `src/lib/auth`: `auth-client.ts` is the interface (`AuthClient`); `msal-auth-client.ts` implements it (the only file that imports MSAL, loaded on demand); `fake-auth-client.ts` is the pretend one; `auth-token-provider.ts` adapts a client to the HTTP client's `TokenProvider`; `auth-controller.ts` holds the rules, with pure helpers in `auth-state.ts`.
- `src/services/auth.ts` builds the client from the settings. Import `authClient`, `authSession` and `clearLocalData` from `@/services`. `src/features/auth`: `auth-provider.tsx`, `auth-gate.tsx`, `sign-in-screen.tsx`, `session-ended-dialog.tsx`, `user-menu.tsx`.
- With no session in the tab the app goes to Microsoft once, automatically. After a sign-out or a failed attempt it shows the sign-in screen and waits for the button (a flag in `sessionStorage`), so a broken setup can't loop.
- The account is the one the sign-in returned, never a pick among several cached ones.
- A call still refused after a token refresh means the session has ended: the app stays mounted under a dialog, and signing in again happens in a separate window so unsaved work is kept.
- A token that can't be renewed because the network is down fails the call ("Can't reach the server"). It does not sign the person out.
- Sign-out, and a different person signing in, clear both apps' run stores and the mock's stored runs. Sign-out also signs out the person's other tabs.
- In `fake` mode, `window.__auth.expire()` in the console acts out an ended session.
- With sign-in on, open the app at `http://localhost:3000`, not the WSL `172.x` address: Microsoft only accepts http for localhost, and MSAL needs a secure context.

## Structure

- `src/app/(apps)/pipeline/[stage]/page.tsx`: one route for all stages. The URL is the selected stage.
- `src/features/stages/config.ts` holds stage labels, icons and descriptions. `panels.ts` maps stage → panel. Stage order is `STAGE_IDS` in `src/types/pipeline.ts`.
- `src/components/layout`: the app shell, the app switcher, the pipeline sidebar and mobile stage sheet.
- `src/components/pipeline`: reusable stage building blocks (StagePanel, StageFooter, FileList, SplitView, MarkdownViewer, EmptyState, StageStatusBadge).
- `src/features/stages/markdown-stage-panel.tsx`: the file list and rendered document shared by Transformation, Classification and Enrichment. Each of those panels only passes its stage id and wording. `MarkdownViewer` shows YAML front matter as a properties block (`lib/front-matter.ts`, `components/pipeline/document-properties.tsx`).
- `src/features/file-picker`: `FileBrowser` (source tabs, search, list, select all) and `SelectionSummary`, shared by the pipeline's Select stage and Knowledge Studio. They take the sources, the noun and the search hint as props; the selection lives in the store.
- `src/features/extraction`: the extraction workspace shared by both apps, three tabs. `use-extraction-run.ts` holds the definition, the tab and `run()`; `extraction-actions.tsx` (Publish, Run) and `extraction-workspace.tsx` (loading and error states, the tabs) take its result, so a host places them in its own frame (the pipeline's is `features/stages/extract/extract-panel.tsx`). Define edits the extraction definition (`use-extraction-definition.ts`, pure rules in `definition-draft.ts`). Review shows the extracted values as highlights on the document beside the list of records (`review-tab.tsx`, `review-marks.ts`, `records-pane.tsx`, `components/pipeline/annotated-text.tsx` and `annotated-markdown.tsx`). Output renders the records (`lib/output-template.ts`). Label colours are the `label-1` to `label-6` tokens, assigned in `labels.ts`. Records are changed through `useExtractionActions` in `features/run/use-extraction.ts` (the server's answer becomes the new state; nothing is optimistic). Selecting text to label it goes through `lib/dom-selection.ts` and `selection-menu.tsx`. The assistant chat is `assistant-panel.tsx` with `use-assistant.ts`; its messages live in the store and arrive as live events.
- `src/components/ui`: shadcn/ui primitives, re-skinned. Add more with `npx shadcn@latest add <name>`.
- `src/store`: a Zustand store per app, built from slices (navigation, files, run, project). `pipelineRunStore` comes from `createRunStore(key)`: only its run id, selection and proceeded stages are persisted to sessionStorage. `studioRunStore` comes from `createProjectRunStore(key)`: `openProject(id)` loads the project, then its run, and the selection is the run's files; nothing of the run is persisted, only the active document and source tab, per project. `<RunStoreProvider store firstHref>` (in each app's layout) puts one in context and runs its hydrator and `<RunSync>`; `usePipelineStore(selector)` and `useRunStoreApi()` read the current app's store and throw outside a provider. Read derived state through `store/selectors.ts`; the pure rules behind it are in `store/run-state.ts`.
- `src/services`: the boundary to the backend. `contracts.ts` is the interface; `http/` (Django) and `mock/` (in the browser) implement it; `index.ts` picks one from `NEXT_PUBLIC_BACKEND_MODE`; `errors.ts` turns error codes into sentences. Import `services` from `@/services`, never an implementation.
- `src/features/run`: keeps the store in step with the run on the server (`run-sync.tsx`, `attach-run.ts`), plus the hooks and components panels share (`use-execute-stage.ts`, `use-stage-output.ts`, `stage-summary.tsx`, `connection-banner.tsx`).
- `src/lib/api`: the HTTP client and its middleware (request id, auth, retry, timeout, errors). `src/lib/realtime`: the reconnecting WebSocket. Neither knows about runs.
- `src/config/env.ts`: the checked `NEXT_PUBLIC_*` settings, the backend ones and the auth ones (see `.env.example`).
- `src/lib/auth`: sign-in without React (see "Sign-in"). `src/features/auth`: its React side.
- `src/lib`: pure helpers (`stages.ts`, `format.ts`, `utils.ts`) and generic hooks (`use-async-data.ts`, `use-debounced-value.ts`).

## How the UI talks to the backend

- **Commands by REST, state by snapshot, updates by WebSocket.** The browser never talks to NATS.
- A run is a set of files. For each file and each stage there is one **cell** (`pending | queued | running | succeeded | failed | stale`). A stage's status is derived from its cells; nothing stores it.
- Starting a stage only sends the request (`executeStage`). Progress arrives as cells, so never await the work.
- The snapshot is fetched again every time the socket opens, because updates sent while it was down are lost. For each cell the newer `updatedAt` wins.
- Transform's Markdown file is never changed by later stages. Classify writes a copy of it with front matter to a second container, and enrich updates that copy in place. So classify and enrich return the same text (`sharedOutputStages` in `contracts.ts`), and running classify again drops the enrichment.
- Extraction is driven by a definition (prompt, record types, fields that are an exact quote or inferred). Its result is records per file whose values carry spans into the enriched Markdown. Spans count Unicode code points, not string indices: convert with `lib/text-spans.ts`. The Rendered view maps text nodes back to the source with `lib/rehype-highlights.ts` and `lib/markdown-offsets.ts`. What the backend has to provide is written in `docs/extraction-api.md`: keep it in step with `contracts.ts`. Two rules to keep: an extraction run never replaces what a person added, accepted, rejected or edited (`services/mock/extraction-merge.ts`), and a value sent back unchanged keeps its origin and review.
- The backend endpoints don't exist yet: the app runs on the mock by default. If the mock and the real API disagree, fix `services/http` and `services/mock`, not the store or the panels.
- In mock mode, `window.__mockBackend` in the console can `dropConnection(ms)`, `failNext(stage)`, `unanchorNext()`, `lastExamplesUsed(runId)` and `setSpeed(n)`. The mock assistant understands a fixed set of requests (see `services/mock/mock-assistant.ts`).

## Adding a stage

1. Add its id to `STAGE_IDS` (in run order).
2. Add metadata in `features/stages/config.ts`.
3. Create `features/stages/<id>/<id>-panel.tsx` using `StagePanel`, and register it in `panels.ts`.
4. If proceeding needs more than `status === "ready"`, extend `canProceedFrom` in `store/selectors.ts`.
5. Give the mock a duration for it (`WORK_MS` in `services/mock/mock-backend.ts`). The run button comes from `useExecuteStage(<id>)`.

## Commands

- `npm run dev`: start the dev server
- `npm test`: unit tests with Node's own test runner (`src/**/*.test.ts`, no test library installed)
- `npm run lint`, `npx tsc --noEmit`: run both before committing
- `npm run build`: also validates Cache Components rules
- `npx prettier --write .`: format the code
