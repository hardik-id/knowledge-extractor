# Knowledge Studio: API for the backend

Knowledge Studio is a second app in the same UI (the `/studio` route). It has two stages: select and extract. Its files are enriched Markdown documents that already sit in an Azure storage container. This page is what the studio needs from the Django API on top of what [extraction-api.md](extraction-api.md) describes. Everything run-scoped there stays as it is.

The UI side is `src/services/contracts.ts` (`DocumentsApi`, `SourceFile.etag`), `src/services/http/` and `src/services/mock/`. If the real API has to differ, change this document and those places together.

Status: the UI uses every section, and the Django API (`hardik-id/knowledge-extractor-api`) serves all of it. For Studio it serves `documents`, `documents/{id}`, `runs`, `runs/{id}`, the extraction definition, executions of `extract`, a file's extraction and its corrections, the assistant's messages, `ws-ticket` and the run's socket. It does not serve `sources/...`, stage outputs or `publish`, which only the pipeline app uses. `npm run test:api` walks the Studio flow against a running backend (`API_BASE_URL`, `DEV_ACCESS_TOKEN`; see `.env.example`).

## Model

- A **document** is one file in the container. Its **id** is whatever the API uses to find it again: today the blob path (`enriched/engineering/architecture/platform-adrs.md`), so it may contain slashes. The UI never builds an id.
- A document has an **ETag**. It changes whenever the document changes.
- A person only ever sees documents they may open. The API decides that, not the UI.
- A run is still created from the chosen documents. It has one stage, `extract`.

## 1. Auth

- Every call carries the person's bearer token. What the API checks in it is in [auth-api.md](auth-api.md).
- The API decides what a person may open with **its own permissions**, and reads the storage container with its own identity, not the person's. It must apply that decision on every call, so nobody lists or reads a document they may not open.
- The extraction service reads the document with its own identity too. It only reads documents that the person who started the run may open.

| Status | Code                 | When                                                        |
| ------ | -------------------- | ----------------------------------------------------------- |
| 401    | `unauthenticated`    | no token, or it has expired                                 |
| 403    | `forbidden`          | the token is fine, but the person may not open the document |
| 404    | `document_not_found` | the id is not in the container                              |

Where a person may not even know a document exists, 404 is fine instead of 403.

## 2. Listing documents

`GET /documents?q=<text>`

Returns the documents the person can open, filtered by `q` on name and location (a substring, case does not matter). An empty or missing `q` lists all.

The name `documents` stays.

```json
{
  "items": [
    {
      "id": "enriched/engineering/architecture/architecture-decisions-2026.md",
      "name": "architecture-decisions-2026.md",
      "source": "storage",
      "type": "md",
      "size_bytes": 4120,
      "location": "enriched / engineering / architecture",
      "modified_at": "2026-08-30T16:22:00Z",
      "etag": "0x8DC1A2B3C4D5E6F"
    }
  ]
}
```

- The items have the same shape as the other sources, with `source` set to `storage` and `etag` added.
- `location` is the container path, shown under the name.
- The other sources keep `GET /sources/{source}/items`.

## 3. Reading one document

`GET /documents/{document_id}`

- The id goes in the path percent-encoded, as the UI sends it (`encodeURIComponent`): `documents/enriched%2Fengineering%2F…`. The API accepts `%2F` in it.
- The body is the document as it is stored: UTF-8 Markdown with YAML front matter. No JSON wrapper.
- `Content-Type` says what it is (`text/markdown; charset=utf-8`).
- `ETag` is the document's version, in the usual HTTP form (`"0x8DC1…"`). The UI strips the quotes and a `W/` prefix. A response without an `ETag` header is an error in the UI.

Errors: 401, 403, 404 as in section 1.

## 4. Creating a run from documents

`POST /runs`

```json
{
  "items": [
    {
      "source": "storage",
      "source_ref": "enriched/engineering/architecture/architecture-decisions-2026.md",
      "name": "architecture-decisions-2026.md",
      "type": "md",
      "size_bytes": 4120,
      "location": "enriched / engineering / architecture",
      "modified_at": "2026-08-30T16:22:00Z"
    }
  ]
}
```

- `source_ref` is the document id from the listing.
- A run whose files are all storage documents (`source: "storage"`) has only the `extract` stage: one cell per file, starting `pending`. It has no ingest, transform, classify or enrich cells. A run can't mix storage documents with other files: the API answers 422 `mixed_sources`. Any other run is the full pipeline.
- The API should check that the person may open each document, and answer 403 `forbidden` or 404 `document_not_found` for the first that fails, rather than failing later in the stage.
- A run lives until it is deleted (`DELETE /runs/{run_id}`). It does not expire with a session.
- The response is the run, as in extraction-api.md. Executing, snapshots, live updates, definitions, records, corrections and the assistant are all run-scoped and work as described there.

### Workspaces

A workspace is a name on a run: the run keeps the documents, the configuration, the conversation and the records, and goes on through its own endpoints. The UI starts from a workspace.

- `POST /workspaces` with `{ name, description?, template_id? }` makes the workspace and its empty run (no files, no cells) in one transaction, with the configuration already saved as version 1 from the template (default `adr`) and the note "From template: <name>". An unknown `template_id` is 422 `unknown_template` and makes nothing. `GET /workspaces` answers `{ items, next }`, last activity first. `GET /workspaces/{id}`, `PATCH /workspaces/{id}` (`name` and/or `description`) and `DELETE /workspaces/{id}` (the run and everything on it go too).
- A workspace on the wire: `id`, `name`, `description`, `run_id`, `document_count`, `configuration_version` (the latest saved version; null only for a workspace made before templates), `created_at`, `updated_at` (the last activity, not only a rename).
- `name` is required, at most 120 characters, not blank: otherwise 422 `validation_error`. A workspace that isn't the caller's, or doesn't exist, is 404 `workspace_not_found`.
- `DELETE /runs/{run_id}` on the run of a workspace is 409 `run_belongs_to_workspace`: delete the workspace.

### Templates

A template is a complete configuration to start from.

- `GET /definition-templates` answers `{ items: [{ id, name, description, definition }], next }`: the default (`adr`) first, then the others by name. `definition` is the configuration as in extraction-api.md (`prompt`, `record_types`, `output`, `chunking`, including the `custom` block and the generate call described there) without `version`. Today: `adr`, `skill`, `blank`, `policy-rule`.
- The UI's mock carries the same four (`src/mocks/templates.ts`); `npm run test:api` compares them with what the backend serves. A template that doesn't exist is 404 `template_not_found`.

### Changing the documents of a run

`PUT /runs/{run_id}/documents` with `{ items: [...] }`, the same items as `POST /runs`, replaces the run's documents. A document in both lists keeps its run file (same id, its cell and its records); one left out is dropped with its cell and records; a new one starts `pending`. The configuration and the conversation are kept. The answer is the run, as in section 4, and the run's sockets get `{ "type": "run.changed" }`: fetch the snapshot again. The same rules as section 4 apply (`mixed_sources`, access to each document). While a file of the run is queued or running the answer is 409 `execution_in_progress` and nothing changes.

## 5. How extraction reads the document

- `extract` has no earlier stage to wait for. `POST /runs/{run_id}/stages/extract/executions` can run as soon as the run exists.
- For each file the service reads the document by `source_ref`, and works on that text: the front matter and the body, as for the enriched file in the pipeline. Spans count code points from the start of that text.
- The document's ETag at the time of reading is stored on the file's extraction as `source_etag`. This is how the UI knows which version the records belong to.
- Corrections (records, values, review) are checked against the text of the same version. If the document has changed since the extraction, see below.

## 6. When the document changes

A document can change in storage at any time, outside the run.

- The extraction keeps `source_etag`. The UI can compare it with the `etag` of the document it lists or reads. If they differ, the records are **stale**: they were made from an older text.
- Offsets may no longer fit the new text. `quote` is what the UI uses to find a span again, as in extraction-api.md ("Stale input").
- Stale records are never dropped or rewritten by themselves. Running `extract` again reads the new text and replaces the extraction, keeping what a person added, accepted, rejected or edited, as described in extraction-api.md.
- The cell stays `succeeded`. The API does not need to watch storage and push changes. The first version only needs the ETag to be there to compare.

## 7. Paging

The list is one page, capped by the API, newest first (the Django API returns at most 100 documents) and without a cursor. The UI does not page. A cursor (`next` in the response, `cursor` in the query) can be added later without breaking the call.

## 8. Backend status

The top bar shows what the backend is made of: a badge (worst state wins) that opens a panel with one row per part. `services.status` in `contracts.ts`; the parser is `parseBackendStatus`.

`GET /api/v1/status` (signed in, read only, no outside call):

```json
{
  "environment": "local",
  "parts": [
    {
      "id": "assistant",
      "mode": "stub",
      "label": "Scripted",
      "state": "stub",
      "checked_at": null,
      "problem": null
    },
    {
      "id": "worker",
      "mode": "real",
      "label": "Background worker",
      "state": "failing",
      "checked_at": "2026-11-24T10:00:00Z",
      "problem": "worker_stalled"
    }
  ]
}
```

- Part ids the UI knows: `assistant`, `extraction`, `storage`, `sign_in`, `live_updates`, `worker`. Any other id is listed under its id in words. Parts keep the order sent.
- `mode`: `stub` or `real`. `state`: `stub` (nothing to check), `ok`, `failing`, `unknown` (real, not checked yet). A value the UI does not know reads as `real` and `unknown`.
- `label` is for people: the provider and the model name at most, never an address or a key. `problem` is a short code (`auth_failed`, `not_found`, `rate_limited`, `timeout`, `unreachable`, `bad_request`, `worker_stalled`, `error`), never a message.
- Badge: red "Problem" when a part is `failing`; amber "Stub" (or "Mock data" with the in-browser mock) when a part is a stub; green "Live" when every part is real and `ok` or `unknown`. In a production build the badge only shows for a stub or a problem.
- **A 404 is an answer**: "this backend does not report its status". The panel says so, the badge reads "Status unknown", and nothing else is shown (no toast, no error screen).
- Loaded when the app opens and each time the panel opens; never polled. "Live updates" shows the browser's own socket while a run is open.

`POST /api/v1/status/test` (signed in): checks every real part now and answers the same body. At most one real test per 60 seconds for the deployment; inside that window it answers the stored result with the header `X-Status-Test: cached`, and the panel says "Checked N seconds ago" (from the newest `checked_at`). **If the API is on another origin it must expose `X-Status-Test`** (`Access-Control-Expose-Headers`, see auth-api.md section 5): without it the browser hides the header and a cached answer reads as a new one.

## Open questions

- **Stale on the server.** Should the API mark the extraction itself (for example a `stale` flag) when it notices a new ETag, or is the UI's comparison enough?
- **Folders.** Does the list stay flat with `location`, or does the studio need to browse the container tree?
