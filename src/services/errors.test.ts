import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "@/lib/api/api-error";
import { describeApiError } from "./errors";

describe("describeApiError for templates", () => {
  for (const [code, status] of [
    ["unknown_template", 422],
    ["template_not_found", 404],
  ] as const) {
    test(`${code} has its own sentence`, () => {
      const text = describeApiError(new ApiError({ status, code, message: "Server words." }));
      assert.match(text, /template/i);
      assert.doesNotMatch(text, /Server words/);
    });
  }
});
