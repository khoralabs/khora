import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemoStack } from "./demo-stack.ts";

test("createDemoStack creates file-backed SQLite when databasePath is set", () => {
  const dir = mkdtempSync(join(tmpdir(), "obp-demo-stack-"));
  const dbPath = join(dir, "negotiation.sqlite");
  try {
    const stack = createDemoStack({ databasePath: dbPath });
    stack.client.registerParty({ name: "P", sourcemaps: [] });
    expect(existsSync(dbPath)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
