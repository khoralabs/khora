import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  exportKeyToDistBase,
  mapSrcTypesPathToDist,
  parseTsExportEntries,
  runtimeSidecarOutfile,
} from "./build-publishable-lib";

const repoRoot = path.resolve(import.meta.dir, "../../..");

describe("exportKeyToDistBase", () => {
  test("maps root and subpaths", () => {
    expect(exportKeyToDistBase(".")).toBe("index");
    expect(exportKeyToDistBase("./sqlite")).toBe("sqlite");
    expect(exportKeyToDistBase("./discovery/search")).toBe("discovery/search");
  });
});

describe("runtimeSidecarOutfile", () => {
  test("joins distDir with sidecar distFile", () => {
    expect(
      runtimeSidecarOutfile("/tmp/pkg/dist", {
        sourceFile: "/tmp/src/sqlite-cell-worker.ts",
        distFile: "sqlite-cell-worker.js",
      }),
    ).toBe(path.join("/tmp/pkg/dist", "sqlite-cell-worker.js"));
  });

  test("preserves nested sidecar paths", () => {
    expect(
      runtimeSidecarOutfile("/tmp/pkg/dist", {
        sourceFile: "/tmp/src/w.ts",
        distFile: "sqlite/worker.js",
      }),
    ).toBe(path.join("/tmp/pkg/dist", "sqlite/worker.js"));
  });
});

describe("mapSrcTypesPathToDist", () => {
  test("maps ./src and src prefixes to dist .d.ts", () => {
    expect(mapSrcTypesPathToDist("./src/persistence/sqlite/index.ts")).toBe(
      "./dist/persistence/sqlite/index.d.ts",
    );
    expect(mapSrcTypesPathToDist("src/index.ts")).toBe("./dist/index.d.ts");
  });

  test("does not double-extend .d.ts", () => {
    expect(mapSrcTypesPathToDist("./src/index.d.ts")).toBe("./dist/index.d.ts");
  });

  test("ignores non-src paths", () => {
    expect(mapSrcTypesPathToDist("./dist/index.d.ts")).toBeUndefined();
    expect(mapSrcTypesPathToDist("./lib/foo.ts")).toBeUndefined();
  });
});

describe("parseTsExportEntries", () => {
  test("reads client TypeScript exports and skips schema json", () => {
    const entries = parseTsExportEntries(path.join(repoRoot, "packages/client"));
    const keys = entries.map((e) => e.exportKey).sort();
    expect(keys).toContain(".");
    expect(keys).toContain("./transport");
    expect(keys).toContain("./transport/byte-stream");
    expect(keys.every((k) => !k.endsWith(".json"))).toBe(true);
  });

  test("reads host subpath exports", () => {
    const entries = parseTsExportEntries(path.join(repoRoot, "packages/host"));
    expect(entries.some((e) => e.exportKey === "./sqlite")).toBe(true);
    expect(entries.find((e) => e.exportKey === "./sqlite")?.distBase).toBe("sqlite");
  });

  test("prefers import .ts over types .d.ts", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "khora-exports-"));
    try {
      mkdirSync(path.join(dir, "src"), { recursive: true });
      writeFileSync(path.join(dir, "src", "index.ts"), "export const x = 1;\n");
      writeFileSync(
        path.join(dir, "package.json"),
        `${JSON.stringify({
          name: "tmp",
          exports: {
            ".": {
              types: "./dist/index.d.ts",
              import: "./src/index.ts",
            },
          },
        })}\n`,
      );
      const entries = parseTsExportEntries(dir);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.sourceFile).toBe(path.join(dir, "src", "index.ts"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
