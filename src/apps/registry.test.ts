import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseEnv } from "@/config/env";
import { ALL_APPS, appForPath, isHiddenAppPath, offeredApps } from "./registry";

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

  test("matches the Access app, which every deployment has", () => {
    assert.equal(appForPath("/access")?.id, "access");
    assert.equal(appForPath("/access/members")?.id, "access");
    assert.equal(appForPath("/accessible"), undefined);
  });

  test("every app's href belongs to that app", () => {
    for (const app of ALL_APPS) assert.equal(appForPath(app.href)?.id, app.id);
  });
});

describe("offered apps", () => {
  const studioOnly = offeredApps(["studio"]);
  const reversed = offeredApps(["studio", "pipeline"]);

  test("unset: every app, pipeline first", () => {
    assert.deepEqual(
      offeredApps(parseEnv({}).apps).map((a) => a.id),
      ["pipeline", "studio"],
    );
  });

  test("studio only: / goes to studio, pipeline is not found", () => {
    assert.equal(studioOnly[0].href, "/studio");
    assert.equal(appForPath("/studio/extract", studioOnly)?.id, "studio");
    assert.equal(appForPath("/pipeline/select", studioOnly), undefined);
    assert.equal(isHiddenAppPath("/pipeline/select", studioOnly), true);
    assert.equal(isHiddenAppPath("/pipeline", studioOnly), true);
    assert.equal(isHiddenAppPath("/studio", studioOnly), false);
    assert.equal(isHiddenAppPath("/other", studioOnly), false);
  });

  test("Access is never hidden, whatever the setting offers", () => {
    assert.equal(isHiddenAppPath("/access/members", studioOnly), false);
    assert.equal(
      studioOnly.some((app) => app.id === "access"),
      false,
    );
    assert.equal(
      offeredApps(parseEnv({}).apps).some((app) => app.id === "access"),
      false,
    );
  });

  test("the setting's order is the order offered", () => {
    assert.deepEqual(
      reversed.map((a) => a.id),
      ["studio", "pipeline"],
    );
    assert.equal(isHiddenAppPath("/pipeline/select", reversed), false);
  });
});
