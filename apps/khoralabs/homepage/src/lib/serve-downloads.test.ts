import { describe, expect, test } from "bun:test";
import path from "node:path";
import { DOWNLOADS_DIR, resolveDownloadPath } from "./serve-downloads";

describe("resolveDownloadPath", () => {
  test("resolves nested file under downloads dir", () => {
    const resolved = resolveDownloadPath("/downloads/docs/guide.md");
    expect(resolved).toBe(path.join(DOWNLOADS_DIR, "docs", "guide.md"));
  });

  test("rejects path traversal", () => {
    expect(resolveDownloadPath("/downloads/../secret.md")).toBeNull();
  });

  test("rejects unsupported extension", () => {
    expect(resolveDownloadPath("/downloads/docs/archive.zip")).toBeNull();
  });
});
