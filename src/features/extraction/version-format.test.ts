import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatSavedDate, versionLine } from "./version-format";

const now = new Date("2026-11-20T12:00:00Z");

describe("version line", () => {
  test("names the version and the day it was saved", () => {
    assert.equal(versionLine(4, "2026-11-19T10:00:00Z", now), "Version 4, saved 19 November");
  });

  test("adds the year for an earlier year", () => {
    assert.equal(formatSavedDate("2025-03-02T10:00:00Z", now), "2 March 2025");
  });

  test("leaves out the date when it can't be read", () => {
    assert.equal(versionLine(1, "nope", now), "Version 1");
  });
});
