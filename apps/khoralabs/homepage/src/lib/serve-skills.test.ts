import { describe, expect, test } from "bun:test";
import path from "node:path";
import { resolveSkillPath, SKILLS_DIR } from "./serve-skills";

describe("resolveSkillPath", () => {
  test("resolves skill and command reference paths", () => {
    expect(resolveSkillPath("/skills/khora-cli/SKILL.md")).toBe(
      path.join(SKILLS_DIR, "khora-cli", "SKILL.md"),
    );
    expect(resolveSkillPath("/skills/khora-cli/references/commands.md")).toBe(
      path.join(SKILLS_DIR, "khora-cli", "references", "commands.md"),
    );
  });

  test("rejects path traversal and unsupported extensions", () => {
    expect(resolveSkillPath("/skills/../secret.md")).toBeNull();
    expect(resolveSkillPath("/skills/khora-cli/archive.zip")).toBeNull();
  });
});
