import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  INITIAL_SELECTION,
  resolveRecordId,
  resolveTypeId,
  screenReducer,
  type ScreenSelection,
} from "./screen-state";

const anchor = { left: 1, top: 2, right: 3, bottom: 4 };
const withState = (patch: Partial<ScreenSelection>): ScreenSelection => ({
  ...INITIAL_SELECTION,
  ...patch,
});

describe("screenReducer", () => {
  test("starts with nothing chosen and the conversation closed", () => {
    assert.deepEqual(INITIAL_SELECTION, {
      selectedTypeId: null,
      currentRecordId: null,
      selectedFieldId: null,
      openValue: null,
      proposal: null,
      conversationOpen: false,
    });
  });

  test("another record type clears the record, the field and the open value", () => {
    const state = withState({
      selectedTypeId: "t1",
      currentRecordId: "r1",
      selectedFieldId: "f1",
      openValue: { valueId: "v1", anchor },
    });
    assert.deepEqual(screenReducer(state, { type: "selectType", typeId: "t2" }), {
      ...INITIAL_SELECTION,
      selectedTypeId: "t2",
    });
  });

  test("choosing the same type again changes nothing", () => {
    const state = withState({ selectedTypeId: "t1", currentRecordId: "r1" });
    assert.equal(screenReducer(state, { type: "selectType", typeId: "t1" }), state);
  });

  test("sets and clears the record, the field and the open value", () => {
    let state = screenReducer(INITIAL_SELECTION, { type: "setCurrentRecord", recordId: "r2" });
    state = screenReducer(state, { type: "selectField", fieldId: "f3" });
    state = screenReducer(state, { type: "openValue", value: { valueId: "v9", anchor } });
    assert.equal(state.currentRecordId, "r2");
    assert.equal(state.selectedFieldId, "f3");
    assert.deepEqual(state.openValue, { valueId: "v9", anchor });
    state = screenReducer(state, { type: "selectField", fieldId: null });
    state = screenReducer(state, { type: "openValue", value: null });
    assert.equal(state.selectedFieldId, null);
    assert.equal(state.openValue, null);
  });

  test("keeps the proposal and the conversation", () => {
    let state = screenReducer(INITIAL_SELECTION, { type: "setProposal", proposal: { n: 1 } });
    state = screenReducer(state, { type: "setConversationOpen", open: true });
    assert.deepEqual(state.proposal, { n: 1 });
    assert.equal(state.conversationOpen, true);
  });
});

describe("resolveTypeId", () => {
  const types = [{ id: "t1" }, { id: "t2" }];
  test("defaults to the first type", () => {
    assert.equal(resolveTypeId(null, types), "t1");
  });
  test("keeps the chosen type while it exists", () => {
    assert.equal(resolveTypeId("t2", types), "t2");
  });
  test("falls back to the first when the chosen type is gone, and to null when there are none", () => {
    assert.equal(resolveTypeId("gone", types), "t1");
    assert.equal(resolveTypeId("t1", []), null);
  });
});

describe("resolveRecordId", () => {
  const records = [
    { id: "r1", recordTypeId: "t1" },
    { id: "r2", recordTypeId: "t2" },
    { id: "r3", recordTypeId: "t2" },
  ];
  test("defaults to the first record of the type", () => {
    assert.equal(resolveRecordId(null, records, "t2"), "r2");
  });
  test("defaults to the first record that is not rejected, as the strip orders them", () => {
    const rejectedFirst = [
      { id: "a", recordTypeId: "t1", review: "rejected" as const },
      { id: "b", recordTypeId: "t1", review: "suggested" as const },
    ];
    assert.equal(resolveRecordId(null, rejectedFirst, "t1"), "b");
  });
  test("keeps the chosen record while it exists, even of another type", () => {
    assert.equal(resolveRecordId("r3", records, "t1"), "r3");
  });
  test("falls back to the first record of the type when the chosen one is gone", () => {
    assert.equal(resolveRecordId("gone", records, "t1"), "r1");
  });
  test("is null when the type has no record", () => {
    assert.equal(resolveRecordId(null, records, "t9"), null);
    assert.equal(resolveRecordId(null, [], "t1"), null);
  });
});
