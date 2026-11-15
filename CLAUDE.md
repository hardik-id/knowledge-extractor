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

## Structure

- `src/app/pipeline/[stage]/page.tsx`: one route for all stages. The URL is the selected stage.
- `src/features/stages/config.ts` holds stage labels, icons and descriptions. `panels.ts` maps stage → panel. Stage order is `STAGE_IDS` in `src/types/pipeline.ts`.
- `src/components/layout`: the app shell, header, sidebar and mobile stage sheet.
- `src/components/pipeline`: reusable stage building blocks (StagePanel, StageFooter, FileList, SplitView, MarkdownViewer, EmptyState, StageStatusBadge).
- `src/components/ui`: shadcn/ui primitives, re-skinned. Add more with `npx shadcn@latest add <name>`.
- `src/store`: one Zustand store built from slices (navigation, files, run). Only the run id, the selection and the proceeded stages are persisted to sessionStorage. Read derived state through `store/selectors.ts`; the pure rules behind it are in `store/run-state.ts`.
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
- The backend endpoints don't exist yet: the app runs on the mock by default. If the mock and the real API disagree, fix `services/http` and `services/mock`, not the store or the panels.
- In mock mode, `window.__mockBackend` in the console can `dropConnection(ms)`, `failNext(stage)` and `setSpeed(n)`.

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
