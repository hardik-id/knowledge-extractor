import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { initials } from "./initials";

describe("initials", () => {
  test("two words give two letters", () => {
    assert.equal(initials("Ada Lovelace"), "AL");
  });

  test("uses the first and last word", () => {
    assert.equal(initials("Ada King Lovelace"), "AL");
  });

  test("one word gives its first letter", () => {
    assert.equal(initials("ada"), "A");
  });

  test("ignores extra spaces", () => {
    assert.equal(initials("  ada   lovelace  "), "AL");
  });

  test("an email address gives its first letter", () => {
    assert.equal(initials("ada@example.com"), "A");
    assert.equal(initials("ada.lovelace@example.com"), "A");
  });

  test("nothing gives a question mark", () => {
    assert.equal(initials(""), "?");
    assert.equal(initials("   "), "?");
  });
});
