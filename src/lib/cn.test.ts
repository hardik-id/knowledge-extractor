import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cn } from "./cn";

describe("cn", () => {
  test("keeps a type step next to a text colour", () => {
    assert.equal(cn("text-small font-medium text-ink"), "text-small font-medium text-ink");
    assert.equal(cn("text-caption text-ink-muted"), "text-caption text-ink-muted");
    assert.equal(cn("text-section text-ink-heading"), "text-section text-ink-heading");
  });

  test("a variant's colour and size both survive", () => {
    assert.equal(
      cn("text-body", "bg-primary text-primary-foreground", "h-control-sm text-small"),
      "bg-primary text-primary-foreground h-control-sm text-small",
    );
  });

  test("a button's size can set its type step without losing its colour", () => {
    assert.equal(
      cn("text-body font-medium", "text-on-danger", "h-control-xs px-2 text-caption"),
      "font-medium text-on-danger h-control-xs px-2 text-caption",
    );
  });

  test("a later type step replaces an earlier one", () => {
    assert.equal(cn("text-body text-ink", "text-small"), "text-ink text-small");
    assert.equal(cn("text-body", "text-lg"), "text-lg");
  });

  test("a later colour replaces an earlier one", () => {
    assert.equal(cn("text-small text-ink", "text-danger"), "text-small text-danger");
  });

  test("a caller can override the control height", () => {
    assert.equal(cn("h-control px-2", "h-8"), "px-2 h-8");
    assert.equal(cn("h-control", "h-control-lg"), "h-control-lg");
    assert.equal(cn("h-8", "h-control"), "h-control");
    assert.equal(cn("size-control", "size-8"), "size-8");
    assert.equal(cn("size-control", "h-control-sm"), "size-control h-control-sm");
  });

  test("a caller can override the radius", () => {
    assert.equal(cn("rounded-control", "rounded-panel"), "rounded-panel");
    assert.equal(cn("rounded-control", "rounded-pill"), "rounded-pill");
    assert.equal(cn("rounded-panel", "rounded-control"), "rounded-control");
    assert.equal(cn("rounded-control", "rounded-lg"), "rounded-lg");
    assert.equal(cn("rounded-lg", "rounded-control"), "rounded-control");
  });

  test("still joins like clsx", () => {
    assert.equal(cn("a", false && "b", { c: true, d: false }, ["e"]), "a c e");
  });
});
