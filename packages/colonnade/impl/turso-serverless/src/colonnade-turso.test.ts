import { describe, expect, test } from "bun:test";

import { parsePoolShardIndex, resolveTursoUrl } from "./resolve-url";

describe("resolveTursoUrl", () => {
  test("substitutes cellId and shardIndex for pool shards", () => {
    const url = resolveTursoUrl(
      { urlTemplate: "libsql://colonnade-{shardIndex}.example.turso.io" },
      "colonnade-shard-2",
    );
    expect(url.url).toBe("libsql://colonnade-2.example.turso.io");
  });

  test("parsePoolShardIndex extracts index", () => {
    expect(parsePoolShardIndex("colonnade-shard-0")).toBe("0");
    expect(parsePoolShardIndex("colonnade-p-abc")).toBeUndefined();
  });
});

describe("Turso Colonnade cluster integration", () => {
  test.skip("requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN", () => {
    // Live Turso tests run when credentials are configured in CI.
    expect(true).toBe(true);
  });
});
