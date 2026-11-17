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
- Each app has its own routes (`src/app/<id>/`), its own run store (`RunStoreProvider` in its layout) and its own folder for app-only code (`src/apps/<id>/`). Anything two apps both need is a shared component (`components/`, `features/file-picker`, `features/extraction`), not a copy and not an `if` on the app. Adding an app: an entry in the registry and the icon map, a route folder with a layout, a store, and a proxy matcher only if it needs one.
- Apps: **Knowledge Extractor** (`pipeline`, `/pipeline/[stage]`) and **Knowledge Studio** (`studio`, `/studio`, experimental): extraction only, over enriched Markdown documents in a storage container. Its documents come from `services.documents` and `catalog.list("storage")`; extraction reads the document by the run file's `sourceRef` and keeps its ETag as `sourceEtag`. What the backend has to provide is in `docs/studio-api.md`. Routes: `/studio` (Documents: pick, then "Open in extraction" creates the run) and `/studio/extract` (the extraction workspace, no stage sidebar or proceed footer, no Publish). Its code is in `src/apps/studio/`: `studio-nav.tsx` (sidebar and mobile nav, rules in `nav-steps.ts`), `studio-panel.tsx` (the StagePanel look without "Stage N of M" or footer), `documents-panel.tsx`, `extract-page-content.tsx`.
- Trunk-based: everything merges to `main` through short-lived branches (`studio/<topic>` for studio work). Experiments live in `main` as their own app; dropping one means deleting its registry entry, its routes and `src/apps/<id>/`.
- Backlog is GitHub issues. `track: studio` and the milestone "Knowledge Studio experiment" mark studio work, `track: shared` work that affects every app. Tracking issue #29.

## Structure

- `src/app/pipeline/[stage]/page.tsx`: one route for all stages. The URL is the selected stage.
- `src/features/stages/config.ts` holds stage labels, icons and descriptions. `panels.ts` maps stage → panel. Stage order is `STAGE_IDS` in `src/types/pipeline.ts`.
- `src/components/layout`: the app shell, the app switcher, the pipeline sidebar and mobile stage sheet.
- `src/components/pipeline`: reusable stage building blocks (StagePanel, StageFooter, FileList, SplitView, MarkdownViewer, EmptyState, StageStatusBadge).
- `src/features/stages/markdown-stage-panel.tsx`: the file list and rendered document shared by Transformation, Classification and Enrichment. Each of those panels only passes its stage id and wording. `MarkdownViewer` shows YAML front matter as a properties block (`lib/front-matter.ts`, `components/pipeline/document-properties.tsx`).
- `src/features/file-picker`: `FileBrowser` (source tabs, search, list, select all) and `SelectionSummary`, shared by the pipeline's Select stage and Knowledge Studio. They take the sources, the noun and the search hint as props; the selection lives in the store.
- `src/features/extraction`: the extraction workspace shared by both apps, three tabs. `use-extraction-run.ts` holds the definition, the tab and `run()`; `extraction-actions.tsx` (Publish, Run) and `extraction-workspace.tsx` (loading and error states, the tabs) take its result, so a host places them in its own frame (the pipeline's is `features/stages/extract/extract-panel.tsx`). Define edits the extraction definition (`use-extraction-definition.ts`, pure rules in `definition-draft.ts`). Review shows the extracted values as highlights on the document beside the list of records (`review-tab.tsx`, `review-marks.ts`, `records-pane.tsx`, `components/pipeline/annotated-text.tsx` and `annotated-markdown.tsx`). Output renders the records (`lib/output-template.ts`). Label colours are the `label-1` to `label-6` tokens, assigned in `labels.ts`. Records are changed through `useExtractionActions` in `features/run/use-extraction.ts` (the server's answer becomes the new state; nothing is optimistic). Selecting text to label it goes through `lib/dom-selection.ts` and `selection-menu.tsx`. The assistant chat is `assistant-panel.tsx` with `use-assistant.ts`; its messages live in the store and arrive as live events.
- `src/components/ui`: shadcn/ui primitives, re-skinned. Add more with `npx shadcn@latest add <name>`.
- `src/store`: a Zustand store per app, built from slices (navigation, files, run) by `createRunStore(key)`; `pipelineRunStore` and `studioRunStore` each have their own sessionStorage key. `<RunStoreProvider store firstHref>` (in each app's layout) puts one in context and runs its hydrator and `<RunSync>`; `usePipelineStore(selector)` and `useRunStoreApi()` read the current app's store and throw outside a provider. Only the run id, the selection and the proceeded stages are persisted to sessionStorage. Read derived state through `store/selectors.ts`; the pure rules behind it are in `store/run-state.ts`.
- `src/services`: the boundary to the backend. `contracts.ts` is the interface; `http/` (Django) and `mock/` (in the browser) implement it; `index.ts` picks one from `NEXT_PUBLIC_BACKEND_MODE`; `errors.ts` turns error codes into sentences. Import `services` from `@/services`, never an implementation.
- `src/features/run`: keeps the store in step with the run on the server (`run-sync.tsx`, `attach-run.ts`), plus the hooks and components panels share (`use-execute-stage.ts`, `use-stage-output.ts`, `stage-summary.tsx`, `connection-banner.tsx`).
- `src/lib/api`: the HTTP client and its middleware (request id, auth, retry, timeout, errors). `src/lib/realtime`: the reconnecting WebSocket. Neither knows about runs.
- `src/config/env.ts`: the checked `NEXT_PUBLIC_*` settings (see `.env.example`).
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
