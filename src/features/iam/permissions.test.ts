import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mayInWorkspace, mayTestConnections } from "./permissions";

describe("mayInWorkspace", () => {
  const viewer = { permissions: ["workspace.view"] };
  const editor = { permissions: ["workspace.edit", "workspace.run", "workspace.view"] };

  test("answers from the permissions the API listed for this person", () => {
    assert.equal(mayInWorkspace(viewer, "workspace.view"), true);
    assert.equal(mayInWorkspace(viewer, "workspace.edit"), false);
    assert.equal(mayInWorkspace(editor, "workspace.run"), true);
    assert.equal(mayInWorkspace(editor, "workspace.manage"), false);
  });

  test("a workspace that is not there (yet) allows nothing", () => {
    assert.equal(mayInWorkspace(undefined, "workspace.view"), false);
    assert.equal(mayInWorkspace(null, "workspace.view"), false);
    assert.equal(mayInWorkspace({ permissions: [] }, "workspace.view"), false);
  });
});

describe("mayTestConnections", () => {
  test("only a platform admin; not knowing who the person is counts as no", () => {
    assert.equal(mayTestConnections({ platformAdmin: true }), true);
    assert.equal(mayTestConnections({ platformAdmin: false }), false);
    assert.equal(mayTestConnections(undefined), false);
  });
});
