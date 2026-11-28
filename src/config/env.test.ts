import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  test("defaults to the mock backend", () => {
    const env = parseEnv({});
    assert.equal(env.backendMode, "mock");
    assert.equal(env.apiBaseUrl, "");
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
    const entra = { authMode: "entra", entraTenantId: "t", entraClientId: "c" };
    assert.equal(parseEnv({ ...raw, nodeEnv: "development" }).devAccessToken, "t");
    assert.equal(parseEnv({ ...raw, ...entra, nodeEnv: "production" }).devAccessToken, null);
  });

  test("auth mode defaults to none, with no Entra settings", () => {
    for (const raw of [{}, { authMode: "  " }]) {
      const env = parseEnv(raw);
      assert.equal(env.authMode, "none");
      assert.equal(env.entra, null);
    }
    assert.deepEqual(parseEnv({}), {
      backendMode: "mock",
      apiBaseUrl: "",
      wsBaseUrl: "",
      devAccessToken: null,
      authMode: "none",
      apps: ["pipeline", "studio"],
      entra: null,
    });
  });

  test("an unknown auth mode throws", () => {
    assert.throws(() => parseEnv({ authMode: "x" }), /NEXT_PUBLIC_AUTH_MODE/);
  });

  test("entra mode needs the tenant id and the client id", () => {
    assert.throws(() => parseEnv({ authMode: "entra", entraClientId: "c" }), /ENTRA_TENANT_ID/);
    assert.throws(
      () => parseEnv({ authMode: "entra", entraTenantId: "t", entraClientId: " " }),
      /ENTRA_CLIENT_ID/,
    );
  });

  test("entra settings are honoured in mock mode, with the default scope", () => {
    const env = parseEnv({ authMode: "entra", entraTenantId: " t ", entraClientId: " c " });
    assert.equal(env.backendMode, "mock");
    assert.equal(env.authMode, "entra");
    assert.deepEqual(env.entra, {
      tenantId: "t",
      clientId: "c",
      apiScope: "api://c/access_as_user",
    });
  });

  test("an explicit scope is used; a blank one falls back to the default", () => {
    const raw = { authMode: "entra", entraTenantId: "t", entraClientId: "c" };
    assert.equal(parseEnv({ ...raw, entraApiScope: " api://x/y " }).entra?.apiScope, "api://x/y");
    assert.equal(
      parseEnv({ ...raw, entraApiScope: " " }).entra?.apiScope,
      "api://c/access_as_user",
    );
  });

  test("entra is null in none and fake modes, whatever the variables hold", () => {
    const vars = { entraTenantId: "t", entraClientId: "c", entraApiScope: "s" };
    assert.equal(parseEnv({ ...vars, authMode: "none" }).entra, null);
    const fake = parseEnv({ ...vars, authMode: "fake", nodeEnv: "development" });
    assert.equal(fake.authMode, "fake");
    assert.equal(fake.entra, null);
  });

  test("fake auth is refused in production", () => {
    assert.throws(
      () => parseEnv({ authMode: "fake", nodeEnv: "production" }),
      /for local checks only/,
    );
  });

  test("production against the real API needs entra sign-in", () => {
    const raw = {
      backendMode: "http",
      apiBaseUrl: "https://api.example.com",
      nodeEnv: "production",
    };
    assert.throws(() => parseEnv(raw), /needs sign-in/);
    assert.throws(() => parseEnv({ ...raw, authMode: "none" }), /needs sign-in/);
    const env = parseEnv({
      ...raw,
      authMode: "entra",
      entraTenantId: "t",
      entraClientId: "c",
    });
    assert.equal(env.authMode, "entra");
    assert.equal(env.apiBaseUrl, "https://api.example.com");
  });

  test("production with the mock backend and no sign-in stays allowed", () => {
    const env = parseEnv({ nodeEnv: "production" });
    assert.equal(env.backendMode, "mock");
    assert.equal(env.authMode, "none");
  });

  test("http mode outside production allows any auth mode", () => {
    const raw = { backendMode: "http", apiBaseUrl: "http://x.test", nodeEnv: "development" };
    assert.equal(parseEnv(raw).authMode, "none");
    assert.equal(parseEnv({ ...raw, authMode: "fake" }).authMode, "fake");
  });
});

describe("parseEnv apps", () => {
  test("left out: every app, pipeline first", () => {
    assert.deepEqual(parseEnv({}).apps, ["pipeline", "studio"]);
  });

  test("keeps the order given and ignores spaces and repeats", () => {
    assert.deepEqual(parseEnv({ apps: "studio" }).apps, ["studio"]);
    assert.deepEqual(parseEnv({ apps: " studio , pipeline,studio" }).apps, ["studio", "pipeline"]);
  });

  test("an unknown id or an empty list fails and names the variable", () => {
    assert.throws(() => parseEnv({ apps: "nope" }), /NEXT_PUBLIC_APPS.*"nope"/);
    // Access is in every deployment: it is not one to choose.
    assert.throws(() => parseEnv({ apps: "studio,access" }), /NEXT_PUBLIC_APPS.*"access"/);
    assert.throws(() => parseEnv({ apps: "studio," }), /NEXT_PUBLIC_APPS/);
    assert.throws(() => parseEnv({ apps: "" }), /NEXT_PUBLIC_APPS/);
    assert.throws(() => parseEnv({ apps: "  " }), /NEXT_PUBLIC_APPS/);
  });
});
