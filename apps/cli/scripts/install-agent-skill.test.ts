import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AGENT_SKILL_SYMLINK_ROOTS,
  AGENTS_SKILLS_CANONICAL,
  linkAgentSkillsRoot,
  runAgentSkillSetup,
} from "./install-agent-skill";

describe("runAgentSkillSetup", () => {
  let workspace: string;
  let home: string;
  let skillAssets: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "khora-skill-"));
    home = path.join(workspace, "home");
    skillAssets = path.join(workspace, "assets", "khora-cli");
    mkdirSync(path.join(skillAssets, "references"), { recursive: true });
    writeFileSync(path.join(skillAssets, "SKILL.md"), "# khora-cli\n");
    writeFileSync(path.join(skillAssets, "references", "commands.md"), "# commands\n");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("installs skill under ~/.agents/skills/khora-cli", () => {
    const result = runAgentSkillSetup({ skillAssetsDir: skillAssets, home });
    expect(result.skillDir).toBe(path.join(home, AGENTS_SKILLS_CANONICAL, "khora-cli"));
    expect(readFileSync(path.join(result.skillDir, "SKILL.md"), "utf8")).toContain("khora-cli");
    expect(readFileSync(path.join(result.skillDir, "references", "commands.md"), "utf8")).toContain(
      "commands",
    );
    expect(result.copied).toContain("SKILL.md");
  });

  test("creates symlinks for alternate agent skill roots", () => {
    runAgentSkillSetup({ skillAssetsDir: skillAssets, home });
    const canonical = path.join(home, AGENTS_SKILLS_CANONICAL);
    for (const rel of AGENT_SKILL_SYMLINK_ROOTS) {
      const alt = path.join(home, rel);
      expect(existsSync(alt)).toBe(true);
      expect(lstatSync(alt).isSymbolicLink()).toBe(true);
      expect(realpathSync(alt)).toBe(realpathSync(canonical));
    }
  });

  test("does not replace an existing real skills directory", () => {
    const cursorSkills = path.join(home, ".cursor", "skills");
    mkdirSync(path.join(cursorSkills, "other-skill"), { recursive: true });
    writeFileSync(path.join(cursorSkills, "other-skill", "SKILL.md"), "keep\n");

    const result = runAgentSkillSetup({ skillAssetsDir: skillAssets, home });
    const cursorLink = result.symlinks.find((s) => s.path === cursorSkills);
    expect(cursorLink?.status).toBe("skipped_exists");
    expect(readFileSync(path.join(cursorSkills, "other-skill", "SKILL.md"), "utf8")).toBe("keep\n");
    expect(existsSync(path.join(home, AGENTS_SKILLS_CANONICAL, "khora-cli", "SKILL.md"))).toBe(
      true,
    );
  });
});

describe("linkAgentSkillsRoot", () => {
  test("reports already_linked when symlink targets canonical root", () => {
    const ws = mkdtempSync(path.join(tmpdir(), "khora-skill-link-"));
    try {
      const home = path.join(ws, "home");
      const canonical = path.join(home, AGENTS_SKILLS_CANONICAL);
      const alternate = path.join(home, ".cursor", "skills");
      mkdirSync(canonical, { recursive: true });
      mkdirSync(path.dirname(alternate), { recursive: true });
      symlinkSync(canonical, alternate, "dir");
      expect(linkAgentSkillsRoot(alternate, canonical)).toBe("already_linked");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
