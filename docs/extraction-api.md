# Extraction: API and workflow for the backend

This is what the Knowledge Extractor UI expects from the Django API and the extraction service. The UI side of it is `src/services/contracts.ts` (types), `src/services/http/` (calls and parsing) and `src/services/mock/` (an in-browser stand-in that follows these rules). If the real API has to differ, change this document and those three places together.

Status: the UI uses every section.

## Model

- A **definition** says what to extract: a prompt, one or more **record types** (for example "ADR"), and the **fields** of each. It also holds the output format.
- A field is taken in one of two **modes**:
  - `quote`: copied exactly from the document. The value is the text of its span.
  - `inferred`: derived by the model, such as a status or a normalised date. Its spans are the passages it relied on.
- The result for one file is a list of **records**. Each record has field values, and each value has **spans** that point into the input text.
- Every record and value has an **origin** (`llm` or `human`) and a **review** state (`suggested`, `accepted`, `rejected`).
- The input text is the stage's input: the enriched Markdown file, front matter included.

### Spans

```json
{ "start": 1204, "end": 1251, "quote": "We will store orders in a dedicated Postgres cluster." }
```

- `start` and `end` count **Unicode code points** from the start of the input text. `end` is exclusive. In Python that is plain `str` indexing; the UI converts to JavaScript indices.
- `quote` is the exact text at those offsets. The UI uses it to find the span again if the offsets no longer fit.
- The service must check every span before storing it: `text[start:end] == quote`. If the model returned a quote that is not in the text, try an exact search for it; if that fails, store the value with `"anchored": false` and its quote as returned. Never drop it: the UI lists it as "Not found in text" so a person can see what the model made up.

## 1. Definition

The run's definition starts as a copy of the pipeline's extraction stage config and is edited per run.

`GET /runs/{run_id}/stages/extract/definition`

```json
{
  "version": 3,
  "prompt": "Extract every architecture decision record.",
  "record_types": [
    {
      "id": "rt_adr",
      "name": "ADR",
      "description": "One architecture decision record.",
      "fields": [
        {
          "id": "f_status",
          "key": "status",
          "name": "Status",
          "description": "The state of the decision.",
          "mode": "inferred",
          "value_type": "choice",
          "choices": ["proposed", "accepted", "superseded", "rejected"],
          "multiple": false
        }
      ]
    }
  ],
  "output": { "format": "markdown", "template": "# {{title}}\n\n**Status:** {{status}}" }
}
```

- `mode`: `quote | inferred`. `value_type`: `text | date | number | choice`. `format`: `json | markdown | csv`.
- A record type with no fields is allowed: a record is then only its own span (the whole block).

`PUT /runs/{run_id}/stages/extract/definition`

Body: the definition without `version`, plus `base_version`. Returns the saved definition with `version` raised by one.

| Status | Code                  | When                                                             |
| ------ | --------------------- | ---------------------------------------------------------------- |
| 409    | `definition_conflict` | `base_version` is not the latest version                         |
| 422    | `invalid_definition`  | an empty key, or two fields of one record type with the same key |

Keep earlier versions: an extraction names the version it used.

### Notes and versions

The UI calls the definition an "extraction configuration". Paths, code and error codes keep the word `definition`.

- `GET` and `PUT` answer `note` (text, empty when none) and `created_at` besides the definition. `PUT` takes an optional `note` of at most 200 characters (longer: 422 `invalid_definition`).
- `GET /runs/{run_id}/stages/extract/definition/versions` answers `{ items: [{ version, note, created_at, record_type_count, field_count }] }`, newest first.
- `GET .../definition/versions/{version}` answers that version in the shape of the definition. An unknown one is 404 `definition_version_not_found`.
- `POST .../definition/versions/{version}/restore` saves a copy of that version as the newest one, with the note `Restored from version N`, and answers it. Earlier versions stay.

## 2. Running the stage

Extraction runs like every other stage:

`POST /runs/{run_id}/stages/extract/executions` with `{ "file_ids": [...], "config": { "definition_version": 3 } }`

`config` is sent with snake_case keys: the UI's `definitionVersion` goes out as `definition_version` (`toWireExecutionConfig` in `src/services/http/parsers.ts`). It is the version the person last saved.

Progress arrives as cells, as for the other stages. When a file finishes, the API also sends the WebSocket message in section 4.

### Service workflow

1. The API stores the execution and publishes `extract.request` with `file_id`, `pipeline_id`, `execution_id` and `status`, in the same shape as the other stages. It does not chain to indexing: this UI runs one stage per click.
2. The extraction service loads the definition version for that execution and the input text from the classified container (the copy enrichment last wrote).
3. It calls the model with the prompt, the record types and fields, and any example records (section 6). Ask for structured output: a list of records, each with its field values and, for every value, the quote it came from.
4. It checks every span as described under Spans, and normalises inferred values to their `value_type` (ISO dates, one of the `choices`).
5. It writes the model's records, then publishes `extract.lifecycle` with the final status.
6. The API merges them with human work (below), raises the file's `revision`, updates the cell and sends `extraction.changed`.

### Keeping human work on a re-run

Running extraction again must not undo what a person did.

- Keep every record and value whose `origin` is `human`, or whose `review` is `accepted` or `rejected`, or that a person edited.
- Replace the rest (untouched `llm` suggestions) with the new run's output.
- Drop a new suggestion whose span overlaps a kept record of the same record type. That covers both "already accepted" and "already rejected, don't suggest it again".

Suggested storage: the model's raw output per execution as a blob beside the other stage outputs, and the merged, reviewable records in the database, since they are edited row by row.

### Stale input

If an earlier stage runs again, the extract cells become `stale`, as today. Records keep the `source_etag` of the text they were made from. The offsets may no longer fit the new text, which is what `quote` is for.

## 3. Reading a file's records

`GET /runs/{run_id}/files/{file_id}/extraction`

```json
{
  "file_id": "file_8f2",
  "revision": 4,
  "source_etag": "enrich-exec_91c",
  "definition_version": 3,
  "records": [
    {
      "id": "rec_1",
      "file_id": "file_8f2",
      "record_type_id": "rt_adr",
      "span": { "start": 310, "end": 1422, "quote": "## ADR-012: Use Postgres..." },
      "origin": "llm",
      "review": "suggested",
      "use_as_example": false,
      "fields": [
        {
          "id": "val_1",
          "field_id": "f_status",
          "value": "accepted",
          "spans": [{ "start": 361, "end": 369, "quote": "Accepted" }],
          "origin": "llm",
          "review": "suggested",
          "anchored": true
        }
      ]
    }
  ]
}
```

- `revision` goes up on every change to the file's records, by a run or by a person.
- A field that was looked for and not found is a value with `"value": null` and no spans.
- A field with `multiple: true` has one value object per value.
- 404 `extraction_not_found` before the first extraction of that file.

## 4. Live updates

On the run's WebSocket, beside the existing `cell` messages:

```json
{ "type": "extraction.changed", "file_id": "file_8f2", "revision": 4 }
```

Send it whenever a file's `revision` changes. The UI fetches the records again when it sees a revision it doesn't have. Messages sent while the socket is down are lost, so the UI also refetches when the extract cell's ETag changes.

## 5. Corrections and manual labelling (the UI uses this)

All paths start with `/runs/{run_id}/files/{file_id}/extraction`, shown below as `…`. Every write carries the `revision` the client last saw and returns the file's new extraction (the body of section 3). Spans on the wire are `{ start, end, quote }`.

| Call                                            | Body                                                                                     | Purpose                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST …/records`                                | `{ revision, record_type_id, span, fields: [{ field_id, values: [{ value, spans }] }] }` | Add a record (a selection marked as a new ADR). `span` may be `null`. Fields left out stay empty.           |
| `PATCH …/records/{record_id}`                   | `{ revision, review?, span?, use_as_example? }`                                          | Change a record. Send only the keys that change. `span: null` is a real value: it clears the record's span. |
| `DELETE …/records/{record_id}?revision=N`       | none                                                                                     | Remove a record a person added.                                                                             |
| `PUT …/records/{record_id}/fields/{field_id}`   | `{ revision, values: [{ value, spans }] }`                                               | Replace all values of one field.                                                                            |
| `PATCH …/records/{record_id}/values/{value_id}` | `{ revision, review }`                                                                   | Accept or reject one value.                                                                                 |

### Rules

- What a person writes is `origin: human` and `review: accepted`. An extraction run never replaces it.
- Accepting a record (`review: accepted`) also accepts its values that are still `suggested`.
- A record type's fields with no value are returned as one value with `"value": null` and no spans, so the UI always has something to show.
- Deleting is only for records a person added. For a model suggestion, set `review: rejected` instead, so it isn't suggested again.
- An empty `values` list resets the field to "not found": the field has one value with `"value": null`, marked `human` and `accepted`, so a later run does not fill it in again.
- A value sent back unchanged (same `value` and `spans` as one the field already has) keeps its id, origin and review. Only new or changed values become `human` and `accepted`. This lets the client add or remove one value of a list without claiming the others.
- A field with `multiple: false` takes at most one value.
- The API checks spans the same way the service does (section "Spans"). A new file extraction starts at revision 1: labelling with no extraction run works through the same calls, and the first `POST` creates it.

### Errors

| Status | Code                   | When                                                          |
| ------ | ---------------------- | ------------------------------------------------------------- |
| 409    | `revision_conflict`    | `revision` is not the file's current one. Refetch, try again  |
| 404    | `extraction_not_found` | the file has no extraction (any call except the first `POST`) |
| 404    | `record_not_found`     | no such record in this file                                   |
| 404    | `value_not_found`      | no such value in this record                                  |
| 422    | `unknown_field`        | `field_id` or `record_type_id` is not in the definition       |
| 422    | `invalid_span`         | `text[start:end] != quote`, or the offsets are out of range   |
| 422    | `not_deletable`        | `DELETE` on a record the model suggested                      |
| 422    | `too_many_values`      | more than one value for a field with `multiple: false`        |
| 422    | `upstream_not_ready`   | the file has no enriched text yet, so spans can't be checked  |

## 6. Assistant and learning

A chat that turns a bare prompt into fields and a template, and adjusts them on request. The assistant proposes. The person applies.

| Call                                                    | Body                   | Returns                                              |
| ------------------------------------------------------- | ---------------------- | ---------------------------------------------------- |
| `GET /runs/{run_id}/extraction/assistant/messages`      | none                   | `{ messages: [message] }`, oldest first              |
| `POST /runs/{run_id}/extraction/assistant/messages`     | `{ text, definition }` | the stored user message (a `message`), once accepted |
| `DELETE /runs/{run_id}/extraction/assistant/messages`   | none                   | 204: the whole conversation is removed               |
| `POST /runs/{run_id}/stages/extract/definition/publish` | none                   | `{ pipeline_config_version, examples }` (section 7)  |

Clearing the conversation changes nothing else (not the definition, not the records). While a reply is being written it answers 409 `assistant_busy`. The run's sockets get `{ "type": "assistant.cleared" }`, so a second tab empties its chat too.

A `message` is:

```json
{
  "id": "msg_1",
  "role": "assistant",
  "text": "I split the approver from the approval date.",
  "proposal": {
    "definition": {
      "prompt": "…",
      "record_types": [],
      "output": { "format": "markdown", "template": "…" }
    },
    "reasons": [{ "path": "ADR / Approved by", "reason": "Two facts need two fields." }]
  },
  "status": "done",
  "created_at": "2026-11-14T10:00:00Z"
}
```

- `role` is `user` or `assistant`. `status` is `streaming` while a reply is being written, then `done`. `proposal` is `null` when there is none.
- The POST body carries the definition as it is on the person's screen, saved or not. The assistant works from that, not from the last saved version. It has the shape of section 1 without `version`.
- The API publishes `extract.assist.request` on NATS with the run, the message and that definition. The assistant service reads them, the conversation and a sample of the run's input texts.
- The reply is one assistant message, built from deltas, with at most one proposal, then done. It arrives on the run's WebSocket:
  - `{ "type": "assistant.delta", "message_id", "text" }` for streamed text, to be appended
  - `{ "type": "assistant.proposal", "message_id", "proposal": { "definition", "reasons": [{ "path", "reason" }] } }`
  - `{ "type": "assistant.done", "message_id" }`
- A proposal is a complete definition (not a patch) plus a reason for each change. `path` names what changed in plain words. The assistant never saves it. Applying it is a normal `PUT` of the definition (section 1).
- Messages missed while the socket was down are recovered with the GET.

| Status | Code                 | When                                            |
| ------ | -------------------- | ----------------------------------------------- |
| 409    | `assistant_busy`     | a reply is still streaming. Wait for `done`     |
| 422    | `empty_message`      | `text` is empty or only spaces                  |
| 422    | `invalid_definition` | the `definition` in the body is not well formed |

Learning: records with `use_as_example: true` and `review: accepted` are sent to the model as examples (the input passage and the expected output together) in later extraction runs of the run.

## 7. Output and publishing

- `GET /runs/{run_id}/files/{file_id}/extraction/output` returns the records in the definition's format. Rejected records and values are left out. The UI renders the same thing locally for preview (`src/lib/output-template.ts`), so the rules must match:
  - `json`: a list of `{ "type": <record type name>, <key>: <value or list> }`.
  - `markdown`: each record through the template. `{{key}}` is the value. `{{#key}}…{{/key}}` repeats once per value with `{{.}}` as the value, and is skipped when there is none.
  - `csv`: a `type` column, then the field keys in definition order. Lists are joined with `; `.
- `POST /runs/{run_id}/stages/extract/definition/publish` has no body. It writes the latest saved definition, and the example records (`use_as_example: true`, `review: accepted`), to the pipeline's extraction stage config. It returns `{ "pipeline_config_version": 4, "examples": 2 }`.
- After publishing, the pipeline's normal trigger-load flow uses that config for every document.

| Status | Code                 | When                                           |
| ------ | -------------------- | ---------------------------------------------- |
| 422    | `nothing_to_publish` | no saved definition, or it has no record types |
