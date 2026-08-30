import { describe, expect, test } from "bun:test";
import path from "node:path";
import { exportKeyToDistBase, parseTsExportEntries } from "./build-publishable-lib";

const repoRoot = path.resolve(import.meta.dir, "..");

describe("exportKeyToDistBase", () => {
  test("maps root and subpaths", () => {
    expect(exportKeyToDistBase(".")).toBe("index");
    expect(exportKeyToDistBase("./sqlite")).toBe("sqlite");
    expect(exportKeyToDistBase("./discovery/search")).toBe("discovery/search");
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
});
