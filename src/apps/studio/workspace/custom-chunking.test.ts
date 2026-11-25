import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "@/lib/api/api-error";
import type { CustomChunkingResult } from "@/services/contracts";
import {
  NO_MEMORY,
  memoryFor,
  rememberApplied,
  rememberWords,
  resultAnnouncement,
  describeGenerateError,
  generateSplitter,
  partSize,
  partsLabel,
} from "./custom-chunking";

const RESULT: CustomChunkingResult = {
  code: "def split(text, size): ...",
  summary: "Splits at headings.",
  documents: [],
};
const REQUEST = { instruction: "Split at headings", sourceUrl: null, size: 4000 };

const failing = (error: unknown) => ({
  generateCustomChunking: async () => {
    throw error;
  },
});

describe("generateSplitter", () => {
  test("a successful call gives the result", async () => {
    const api = { generateCustomChunking: async () => RESULT };
    const outcome = await generateSplitter(api, "r1", REQUEST, new AbortController().signal);
    assert.deepEqual(outcome, { kind: "result", result: RESULT });
  });

  test("the server's words are kept for the custom chunking codes, even on a 504", async () => {
    for (const [status, code, message] of [
      [409, "custom_chunking_off", "Custom chunking is turned off on this server."],
      [422, "custom_chunking_failed", "The assistant could not write splitting code that works."],
      [504, "custom_chunking_timeout", "Writing the splitting code took too long. Try again."],
    ] as const) {
      const outcome = await generateSplitter(
        failing(new ApiError({ status, code, message })),
        "r1",
        REQUEST,
        new AbortController().signal,
      );
      assert.deepEqual(outcome, { kind: "error", message });
    }
  });

  test("model problems and a refused link are shown with what the server said", () => {
    assert.equal(
      describeGenerateError(
        new ApiError({
          status: 409,
          code: "model_not_configured",
          message: "No language model is configured.",
        }),
      ),
      "No language model is configured.",
    );
    assert.equal(
      describeGenerateError(
        new ApiError({
          status: 502,
          code: "model_unreachable",
          message: "The language model could not be reached.",
        }),
      ),
      "The language model could not be reached.",
    );
    assert.equal(
      describeGenerateError(
        new ApiError({
          status: 422,
          code: "validation_error",
          message: "The request is not valid.",
          details: {
            errors: [
              { path: "source_url", message: "Only https links to public pages are allowed." },
            ],
          },
        }),
      ),
      "Reference link: Only https links to public pages are allowed.",
    );
  });

  test("a network failure or an unknown error gets the usual wording", () => {
    assert.match(
      describeGenerateError(new ApiError({ status: 0, code: "network_error", message: "x" })),
      /./,
    );
    assert.equal(describeGenerateError(new Error("boom")), "Something went wrong. Try again.");
  });

  test("an abandoned call reports nothing, whatever the server answers", async () => {
    const controller = new AbortController();
    const api = {
      generateCustomChunking: async () => {
        controller.abort();
        return RESULT;
      },
    };
    assert.deepEqual(await generateSplitter(api, "r1", REQUEST, controller.signal), {
      kind: "abandoned",
    });
    const second = new AbortController();
    const failed = {
      generateCustomChunking: async () => {
        second.abort();
        throw new ApiError({ status: 504, code: "custom_chunking_timeout", message: "late" });
      },
    };
    assert.deepEqual(await generateSplitter(failed, "r1", REQUEST, second.signal), {
      kind: "abandoned",
    });
  });

  test("an ended session reports nothing: the app says it once", async () => {
    const outcome = await generateSplitter(
      failing(new ApiError({ status: 401, code: "unauthorized", message: "x" })),
      "r1",
      REQUEST,
      new AbortController().signal,
      () => true,
    );
    assert.deepEqual(outcome, { kind: "abandoned" });
  });
});

test("part wording", () => {
  assert.equal(partsLabel(1), "1 part");
  assert.equal(partsLabel(4), "4 parts");
  assert.equal(partSize({ start: 10, end: 595 }), 585);
});

describe("what the row remembers", () => {
  const applied = { instruction: "i", sourceUrl: null, code: "c", summary: "s" };
  const words = { instruction: "typed", sourceUrl: "", forCode: null };

  test("it is kept for the same run", () => {
    const m = rememberApplied(rememberWords(NO_MEMORY, "r1", words), "r1", applied);
    assert.deepEqual(memoryFor(m, "r1"), { runId: "r1", words, applied });
  });

  test("another project starts with nothing: typed text and applied code don't leak", () => {
    const m = rememberApplied(rememberWords(NO_MEMORY, "r1", words), "r1", applied);
    assert.deepEqual(memoryFor(m, "r2"), { runId: "r2", words: null, applied: null });
    // Remembering in the new run replaces the old run's memory.
    const next = rememberWords(m, "r2", { ...words, instruction: "other" });
    assert.equal(next.applied, null);
    assert.equal(memoryFor(next, "r1").words, null);
  });

  test("the status line announces a finished result", () => {
    assert.equal(resultAnnouncement(1), "Code written, 1 document checked");
    assert.equal(resultAnnouncement(4), "Code written, 4 documents checked");
  });
});
