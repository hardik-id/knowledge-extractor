import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "@/lib/api/api-error";
import { isRefusal } from "./refusal";

const failure = (status: number, code: string) => new ApiError({ status, code, message: "x" });

describe("isRefusal", () => {
  test("is a 403 forbidden", () => {
    assert.equal(isRefusal(failure(403, "forbidden")), true);
  });

  test("is nothing else", () => {
    assert.equal(isRefusal(failure(403, "other")), false);
    assert.equal(isRefusal(failure(404, "forbidden")), false);
    assert.equal(isRefusal(failure(401, "unauthorized")), false);
    assert.equal(isRefusal(new Error("forbidden")), false);
    assert.equal(isRefusal(undefined), false);
  });
});
