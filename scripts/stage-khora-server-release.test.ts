import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_TARGETS } from "./stage-khora-release";
import { resolveSqliteVecLoadable } from "./stage-khora-server-release";

describe("resolveSqliteVecLoadable", () => {
  test("finds host-platform vec0 under node_modules/.bun", () => {
    const workspaceRoot = path.resolve(import.meta.dir, "..");
    const host = SUPPORTED_TARGETS.find((t) => t.os === process.platform && t.cpu === process.arch);
    if (host === undefined) return;
    const p = resolveSqliteVecLoadable(workspaceRoot, host);
    expect(p).toBeString();
    if (p === undefined) {
      throw new Error("expected p");
    }
    expect(existsSync(p)).toBe(true);
  });
});
