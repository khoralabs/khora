import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  KHORA_LIB_PUBLISH_ORDER,
  stagedClientExports,
  stagedDependencies,
  stagedExports,
} from "./stage-khora-libs-release";

const repoRoot = path.resolve(import.meta.dir, "..");

describe("stage khora libs helpers", () => {
  test("publish order is client → registry → host", () => {
    expect([...KHORA_LIB_PUBLISH_ORDER]).toEqual(["khora-client", "khora-registry", "khora-host"]);
  });

  test("client exports include schema, transport, and dist entry", () => {
    const e = stagedClientExports();
    expect((e["."] as Record<string, string>).types).toBe("./dist/index.d.ts");
    expect(e["./khora-config.schema.json"]).toBe("./khora-config.schema.json");
    expect((e["./transport"] as Record<string, string>).import).toBe("./dist/transport.js");
  });

  test("stagedExports mirrors package export map for host sqlite", () => {
    const e = stagedExports("khora-host", path.join(repoRoot, "packages/host"));
    expect((e["./sqlite"] as Record<string, string>).types).toBe("./dist/sqlite.d.ts");
  });

  test("client does not depend on workspace contracts package", () => {
    const deps = stagedDependencies("khora-client", "1.2.3");
    expect(deps["@khoralabs/khora-contracts"]).toBeUndefined();
    expect(deps["@khoralabs/did-key-identity"]).toBe("^0.1.0");
    expect(deps.zod).toBe("^4");
  });

  test("host pins sibling libs to lockstep version", () => {
    const deps = stagedDependencies("khora-host", "9.9.9");
    expect(deps["@khoralabs/khora-client"]).toBe("9.9.9");
    expect(deps["@khoralabs/khora-registry"]).toBe("9.9.9");
    expect(deps["@khoralabs/colonnade"]).toBeUndefined();
  });
});
