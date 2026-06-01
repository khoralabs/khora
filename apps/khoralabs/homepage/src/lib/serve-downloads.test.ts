import { describe, expect, test } from "bun:test";
import path from "node:path";
import { DOWNLOADS_DIR, resolveDownloadPath } from "./serve-downloads";

describe("resolveDownloadPath", () => {
  test("resolves nested file under downloads dir", () => {
    const resolved = resolveDownloadPath("/downloads/skills/khora-cli/SKILL.md");
    expect(resolved).toBe(path.join(DOWNLOADS_DIR, "skills", "khora-cli", "SKILL.md"));
  });

  test("rejects path traversal", () => {
    expect(resolveDownloadPath("/downloads/../secret.md")).toBeNull();
  });

  test("rejects unsupported extension", () => {
    expect(resolveDownloadPath("/downloads/skills/khora-cli/archive.zip")).toBeNull();
  });
});
