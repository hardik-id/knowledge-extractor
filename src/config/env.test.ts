import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  test("defaults to the pipeline app and the mock backend", () => {
    const env = parseEnv({});
    assert.equal(env.appMode, "pipeline");
    assert.equal(env.backendMode, "mock");
    assert.equal(env.apiBaseUrl, "");
  });

  test("blank app mode falls back to pipeline", () => {
    assert.equal(parseEnv({ appMode: "  " }).appMode, "pipeline");
  });

  test("an unknown app mode throws", () => {
    assert.throws(() => parseEnv({ appMode: "nope" }), /NEXT_PUBLIC_APP_MODE/);
  });

  test("an unknown backend mode throws", () => {
    assert.throws(() => parseEnv({ backendMode: "x" }), /NEXT_PUBLIC_BACKEND_MODE/);
  });

  test("http mode needs an API URL", () => {
    assert.throws(() => parseEnv({ backendMode: "http" }), /API_BASE_URL is required/);
  });

  test("http mode rejects a URL that is not http(s)", () => {
    assert.throws(
      () => parseEnv({ backendMode: "http", apiBaseUrl: "ftp://x" }),
      /must start with/,
    );
    assert.throws(() => parseEnv({ backendMode: "http", apiBaseUrl: "nope" }), /full URL/);
  });

  test("http mode trims trailing slashes and derives the socket URL", () => {
    const env = parseEnv({ backendMode: "http", apiBaseUrl: "https://api.example.com/api/v1/" });
    assert.equal(env.apiBaseUrl, "https://api.example.com/api/v1");
    assert.equal(env.wsBaseUrl, "wss://api.example.com");
  });

  test("the dev token is ignored in production", () => {
    const raw = { backendMode: "http", apiBaseUrl: "http://x.test", devAccessToken: "t" };
    assert.equal(parseEnv({ ...raw, nodeEnv: "development" }).devAccessToken, "t");
    assert.equal(parseEnv({ ...raw, nodeEnv: "production" }).devAccessToken, null);
  });
});
