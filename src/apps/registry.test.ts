import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { APPS, appForPath } from "./registry";

describe("appForPath", () => {
  test("matches the app root and anything below it", () => {
    assert.equal(appForPath("/pipeline")?.id, "pipeline");
    assert.equal(appForPath("/pipeline/extract")?.id, "pipeline");
    assert.equal(appForPath("/studio")?.id, "studio");
    assert.equal(appForPath("/studio/run/1")?.id, "studio");
  });

  test("does not match a longer first segment or other routes", () => {
    assert.equal(appForPath("/studios"), undefined);
    assert.equal(appForPath("/pipelines/x"), undefined);
    assert.equal(appForPath("/"), undefined);
    assert.equal(appForPath("/other"), undefined);
  });

  test("every app's href belongs to that app", () => {
    for (const app of APPS) assert.equal(appForPath(app.href)?.id, app.id);
  });
});
