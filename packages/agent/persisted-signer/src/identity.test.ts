import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIdentity, loadOrCreateIdentity, saveIdentity } from "./identity.ts";

describe("identity persistence", () => {
  test("loadOrCreateIdentity creates and reloads the same DID", async () => {
    const dir = mkdtempSync(join(tmpdir(), "persisted-id-"));
    const path = join(dir, "identity.json");
    try {
      const first = await loadOrCreateIdentity(path);
      const second = await loadOrCreateIdentity(path);
      expect(first.did).toBe(second.did);

      const sig1 = await first.sign(new TextEncoder().encode("hello"));
      const sig2 = await second.sign(new TextEncoder().encode("hello"));
      expect(Array.from(sig1)).toEqual(Array.from(sig2));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("saveIdentity / loadIdentity round-trip preserves DID", async () => {
    const dir = mkdtempSync(join(tmpdir(), "persisted-id-"));
    const path = join(dir, "identity.json");
    try {
      const generated = await loadOrCreateIdentity(path);
      await saveIdentity(path, generated);
      const reloaded = await loadIdentity(path);
      expect(reloaded?.did).toBe(generated.did);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("loadIdentity returns undefined when file is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "persisted-id-"));
    try {
      const result = await loadIdentity(join(dir, "missing.json"));
      expect(result).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
