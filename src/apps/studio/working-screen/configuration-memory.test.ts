import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CONFIGURATION_KEY,
  readConfigurationOpen,
  rememberConfigurationOpen,
} from "./configuration-memory";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("the remembered Configuration choice", () => {
  test("is closed on a first visit", () => {
    assert.equal(readConfigurationOpen(memory()), false);
  });

  test("comes back open or closed as it was left", () => {
    const store = memory();
    rememberConfigurationOpen(true, store);
    assert.equal(store.data.get(CONFIGURATION_KEY), "open");
    assert.equal(readConfigurationOpen(store), true);
    rememberConfigurationOpen(false, store);
    assert.equal(readConfigurationOpen(store), false);
  });

  test("survives a storage that is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    assert.equal(readConfigurationOpen(blocked), false);
    assert.doesNotThrow(() => rememberConfigurationOpen(true, blocked));
    assert.equal(readConfigurationOpen(null), false);
  });
});
