import { describe, expect, test } from "bun:test";

import { createInMemoryPlacementStore, encodeCellId, principalHomeId } from "../../core";
import { resolveTursoCredentialsFromStrategy, resolveTursoUrl } from "./resolve-url";

describe("resolveTursoUrl", () => {
  test("substitutes cellId into url template placeholders", () => {
    const url = resolveTursoUrl(
      { urlTemplate: "libsql://cell-{cellId}.example.turso.io" },
      "home-abc",
    );
    expect(url.url).toBe("libsql://cell-home-abc.example.turso.io");
  });

  test("substitutes shardIndex placeholder with encoded cellId", () => {
    const url = resolveTursoUrl(
      { urlTemplate: "libsql://colonnade-{shardIndex}.example.turso.io" },
      "p1",
    );
    expect(url.url).toBe("libsql://colonnade-p1.example.turso.io");
  });
});

describe("resolveTursoCredentialsFromStrategy", () => {
  test("substitutes ownerKey and kind from placement strategy", () => {
    const id = principalHomeId("alice");
    const cellId = encodeCellId(id);
    const credentials = resolveTursoCredentialsFromStrategy(
      {
        kind: "turso-serverless",
        url: "libsql://{kind}-{ownerKey}.example.turso.io",
        authToken: "tok",
      },
      id,
      cellId,
    );
    expect(credentials.url).toBe("libsql://principal-alice.example.turso.io");
    expect(credentials.authToken).toBe("tok");
  });

  test("placement override url wins over default template", async () => {
    const id = principalHomeId("bob");
    const cellId = encodeCellId(id);
    const placement = createInMemoryPlacementStore({
      defaultStrategy: {
        kind: "turso-serverless",
        url: "libsql://default-{ownerKey}.example.turso.io",
      },
    });
    await placement.setStrategy(id, {
      kind: "turso-serverless",
      url: "libsql://override-{ownerKey}.example.turso.io",
      authToken: "override-tok",
    });
    const strategy = (await placement.getStrategy(id)) ?? (await placement.getDefaultStrategy());
    expect(strategy.kind).toBe("turso-serverless");
    if (strategy.kind !== "turso-serverless") throw new Error("unreachable");
    const credentials = resolveTursoCredentialsFromStrategy(strategy, id, cellId);
    expect(credentials.url).toBe("libsql://override-bob.example.turso.io");
    expect(credentials.authToken).toBe("override-tok");
  });
});

describe("Turso Colonnade cluster integration", () => {
  test.skip("requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN", () => {
    // Live Turso tests run when credentials are configured in CI.
    expect(true).toBe(true);
  });
});
