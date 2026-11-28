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

describe("describeApiError for roles", () => {
  const codes = [
    ["forbidden", 403],
    ["tenant_not_found", 404],
    ["user_not_found", 404],
    ["last_owner", 409],
    ["last_tenant_admin", 409],
    ["last_platform_admin", 409],
    ["already_a_member", 409],
    ["not_a_tenant_member", 422],
    ["tenant_name_taken", 409],
    ["tenant_not_empty", 409],
    ["default_tenant", 409],
    ["platform_admin_by_setting", 409],
  ] as const;
  for (const [code, status] of codes) {
    test(`${code} has its own sentence`, () => {
      const text = describeApiError(new ApiError({ status, code, message: "Server words." }));
      assert.doesNotMatch(text, /Server words/);
      assert.match(text, /\.$/);
    });
  }
});
