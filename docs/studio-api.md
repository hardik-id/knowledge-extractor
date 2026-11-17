# Knowledge Studio: API for the backend

Knowledge Studio is a second app in the same UI (the `/studio` route). It has two stages: select and extract. Its files are enriched Markdown documents that already sit in an Azure storage container. This page is what the studio needs from the Django API on top of what [extraction-api.md](extraction-api.md) describes. Everything run-scoped there stays as it is.

The UI side is `src/services/contracts.ts` (`DocumentsApi`, `SourceFile.etag`), `src/services/http/` and `src/services/mock/`. If the real API has to differ, change this document and those places together.

Status: the UI uses every section. The endpoint names are open (see the questions at the end).

## Model

- A **document** is one file in the container. Its **id** is whatever the API uses to find it again (a blob path, or an opaque id). The UI never builds an id.
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

Returns the documents the person can open, filtered by `q` on name and location. An empty or missing `q` lists all.

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
- The response is the run, as in extraction-api.md. Executing, snapshots, live updates, definitions, records, corrections and the assistant are all run-scoped and work as described there.

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

The first version lists one page only, as the other sources do. A container can hold many documents, so the API should limit the page itself and return the newest first. A cursor (`next` in the response, `cursor` in the query) can be added later without breaking the call.

## Open questions

- **Names.** `documents` is the name the UI uses now. The backend owner is thinking of something like `/list-files`. Any name works if it is changed in `src/services/http/index.ts` and here.
- **Document ids.** A blob path contains slashes. Should the id be an opaque string, or must the path be encoded in the URL (`documents/{id}`)? The UI encodes it with `encodeURIComponent`, so the router has to accept `%2F`.
- **Paging and search.** How many documents are expected? Is `q` a prefix, a substring, or full text?
- **Stale on the server.** Should the API mark the extraction itself (for example a `stale` flag) when it notices a new ETag, or is the UI's comparison enough?
- **Folders.** Does the list stay flat with `location`, or does the studio need to browse the container tree?
- **Run lifetime.** A run is deleted with `DELETE /runs/{run_id}` as today. Do runs of documents live longer than a session?
