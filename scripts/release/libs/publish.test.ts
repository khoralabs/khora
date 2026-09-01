import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyPublishedPackageJson,
  KHORA_LIB_PUBLISH_ORDER,
  publishedDependencies,
  publishedExports,
} from "./publish";

const repoRoot = path.resolve(import.meta.dir, "../../..");

describe("publish khora libs helpers", () => {
  test("publish order is client → registry → host", () => {
    expect([...KHORA_LIB_PUBLISH_ORDER]).toEqual(["khora-client", "khora-registry", "khora-host"]);
  });

  test("client exports include schema, transport, and dist entry", () => {
    const e = publishedExports("khora-client", path.join(repoRoot, "packages/client"));
    expect((e["."] as Record<string, string>).types).toBe("./dist/index.d.ts");
    expect(e["./khora-config.schema.json"]).toBe("./khora-config.schema.json");
    expect((e["./transport"] as Record<string, string>).import).toBe("./dist/transport.js");
  });

  test("publishedExports mirrors package export map for host sqlite", () => {
    const e = publishedExports("khora-host", path.join(repoRoot, "packages/host"));
    expect((e["./sqlite"] as Record<string, string>).types).toBe("./dist/sqlite.d.ts");
  });

  test("client does not depend on workspace contracts package", () => {
    const deps = publishedDependencies("khora-client", "1.2.3");
    expect(deps["@khoralabs/khora-contracts"]).toBeUndefined();
    expect(deps["@khoralabs/did-key-identity"]).toBe("^0.1.0");
    expect(deps.zod).toBe("^4");
  });

  test("host pins sibling libs to lockstep version", () => {
    const deps = publishedDependencies("khora-host", "9.9.9");
    expect(deps["@khoralabs/khora-client"]).toBe("9.9.9");
    expect(deps["@khoralabs/khora-registry"]).toBe("9.9.9");
    expect(deps["@khoralabs/colonnade"]).toBeUndefined();
  });

  test("applyPublishedPackageJson strips bundled deps and restores", () => {
    const clientDir = path.join(repoRoot, "packages/client");
    const pkgPath = path.join(clientDir, "package.json");
    const before = readFileSync(pkgPath, "utf8");
    const restore = applyPublishedPackageJson(repoRoot, "khora-client");
    try {
      const mid = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies: Record<string, string>;
        exports: Record<string, unknown>;
        main?: string;
      };
      expect(mid.main).toBe("./dist/index.js");
      expect(mid.dependencies["@khoralabs/khora-auth"]).toBeUndefined();
      expect(mid.dependencies["@khoralabs/khora-contracts"]).toBeUndefined();
      expect(mid.dependencies["@khoralabs/did-key-identity"]).toBe("^0.1.0");
      expect((mid.exports["."] as Record<string, string>).import).toBe("./dist/index.js");
      expect(JSON.stringify(mid)).not.toContain("./src/");
      expect(JSON.stringify(mid.dependencies)).not.toContain("catalog:");
      expect(JSON.stringify(mid.dependencies)).not.toContain("workspace:");
    } finally {
      restore();
    }
    expect(readFileSync(pkgPath, "utf8")).toBe(before);
  });

  test("applyPublishedPackageJson for registry sets optional deps and restores", () => {
    const pkgPath = path.join(repoRoot, "packages/registry/package.json");
    const before = readFileSync(pkgPath, "utf8");
    const restore = applyPublishedPackageJson(repoRoot, "khora-registry");
    try {
      const mid = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        license?: string;
      };
      expect(mid.dependencies["@khoralabs/colonnade"]).toBeUndefined();
      expect(mid.dependencies["@khoralabs/khora-auth"]).toBeUndefined();
      expect(mid.dependencies["@khoralabs/sqlite-crypto"]).toBe("^0.1.0");
      expect(mid.optionalDependencies?.["@tursodatabase/serverless"]).toBe("^1.2.3");
      expect(mid.license).toBe("MIT");
      expect(JSON.stringify(mid.dependencies)).not.toContain("workspace:");
    } finally {
      restore();
    }
    expect(readFileSync(pkgPath, "utf8")).toBe(before);
  });

  test("applyPublishedPackageJson for host pins siblings and restores", () => {
    const pkgPath = path.join(repoRoot, "packages/host/package.json");
    const before = readFileSync(pkgPath, "utf8");
    const version = (JSON.parse(before) as { version: string }).version;
    const restore = applyPublishedPackageJson(repoRoot, "khora-host");
    try {
      const mid = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies: Record<string, string>;
        license?: string;
      };
      expect(mid.dependencies["@khoralabs/khora-client"]).toBe(version);
      expect(mid.dependencies["@khoralabs/khora-registry"]).toBe(version);
      expect(mid.dependencies["@khoralabs/colonnade"]).toBeUndefined();
      expect(mid.dependencies["@khoralabs/percolator"]).toBeUndefined();
      expect(mid.license).toBe("MIT");
      expect(JSON.stringify(mid.dependencies)).not.toContain("workspace:");
      expect(JSON.stringify(mid.dependencies)).not.toContain("catalog:");
    } finally {
      restore();
    }
    expect(readFileSync(pkgPath, "utf8")).toBe(before);
  });
});
