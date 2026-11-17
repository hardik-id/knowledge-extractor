import { isApiError } from "@/lib/api/api-error";

/** Backend and client error codes the UI has its own words for. */
const MESSAGES: Record<string, string> = {
  network_error: "Can't reach the server. Check your connection and try again.",
  timeout: "The server took too long to answer. Try again.",
  invalid_response:
    "The server sent something this version of the app can't read. Reload the page.",
  execution_in_progress: "This stage is already running.",
  upstream_not_ready: "The previous stage hasn't finished for every file yet.",
  run_not_found: "This run no longer exists. Select your files again to start a new one.",
  output_not_found: "This file has no output for this stage yet.",
  definition_conflict:
    "The extraction definition was changed somewhere else. Reload it and make your changes again.",
  invalid_definition:
    "The extraction definition isn't complete. Check the names, keys and allowed values.",
  revision_conflict:
    "These records were changed somewhere else. They have been reloaded; make your change again.",
  record_not_found: "This record no longer exists.",
  value_not_found: "This value no longer exists.",
  extraction_not_found: "This file has not been extracted yet.",
  unknown_field: "This field is not part of the record type any more. Reload the definition.",
  invalid_span: "The selected text doesn't match the document. Select it again.",
  not_deletable: "Only records you added can be deleted. Reject this one instead.",
  too_many_values: "This field takes one value only.",
  assistant_busy: "The assistant is still answering. Wait for it to finish.",
  empty_message: "Write a message first.",
  nothing_to_publish: "Save a definition with at least one record type before publishing.",
  no_files: "Select at least one file.",
  mixed_sources: "A run can't mix storage documents with other files. Select one kind only.",
};

/**
 * One sentence a person can act on, for any failed backend call. Unknown
 * failures carry the request id so the call can be found in the backend logs.
 */
export function describeApiError(error: unknown): string {
  if (!isApiError(error)) return "Something went wrong. Try again.";

  const known = MESSAGES[error.code];
  if (known) return known;
  if (error.status === 401) return "Your session has ended. Sign in again.";
  if (error.status === 403) return "You don't have access to this.";

  const reference = error.requestId ? ` (reference ${error.requestId})` : "";
  return error.status >= 500
    ? `The server ran into a problem. Try again in a moment.${reference}`
    : `${error.message}${reference}`;
}
