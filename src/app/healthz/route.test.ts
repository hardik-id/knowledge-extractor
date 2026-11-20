import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "./route";

test("the probe answers 200 with status ok and is not cached", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
