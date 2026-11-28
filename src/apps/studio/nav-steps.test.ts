import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { workspaceHref, workspaceIdFromPath } from "./nav-steps";

describe("studio addresses", () => {
  test("a workspace has one address, under its id", () => {
    assert.equal(workspaceHref("p1"), "/studio/workspaces/p1");
    assert.equal(workspaceHref("a b/c"), "/studio/workspaces/a%20b%2Fc");
  });

  test("the workspace id is read back from the address", () => {
    assert.equal(workspaceIdFromPath("/studio/workspaces/p1"), "p1");
    assert.equal(workspaceIdFromPath("/studio/workspaces/p1/extract"), "p1");
    assert.equal(workspaceIdFromPath(workspaceHref("a b/c")), "a b/c");
    assert.equal(workspaceIdFromPath("/studio"), null);
    assert.equal(workspaceIdFromPath("/studio/workspaces"), null);
    assert.equal(workspaceIdFromPath("/studio/extract"), null);
  });
});
