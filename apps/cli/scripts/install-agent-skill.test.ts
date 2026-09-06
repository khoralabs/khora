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
  installKhoraCliSkill,
  linkAgentSkillsRoot,
  runAgentSkillSetup,
} from "./install-agent-skill";

describe("installKhoraCliSkill", () => {
  let workspace: string;
  let home: string;
  let cwd: string;
  let skillAssets: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "khora-skill-"));
    home = path.join(workspace, "home");
    cwd = path.join(workspace, "project");
    skillAssets = path.join(workspace, "assets", "khora-cli");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(path.join(skillAssets, "how-to"), { recursive: true });
    mkdirSync(path.join(skillAssets, "references"), { recursive: true });
    writeFileSync(path.join(skillAssets, "SKILL.md"), "# khora-cli\n");
    writeFileSync(path.join(skillAssets, "how-to", "SKILL.md"), "# how-to\n");
    writeFileSync(path.join(skillAssets, "references", "commands.md"), "# commands\n");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("installs under cwd/.agents/skills by default", () => {
    const result = installKhoraCliSkill({
      skillAssetsDir: skillAssets,
      home,
      cwd,
    });
    expect(result.global).toBe(false);
    expect(result.status).toBe("copied");
    expect(result.skillDir).toBe(path.join(cwd, AGENTS_SKILLS_CANONICAL, "khora-cli"));
    expect(readFileSync(path.join(result.skillDir, "how-to", "SKILL.md"), "utf8")).toContain(
      "how-to",
    );
    expect(result.symlinks).toEqual([]);
  });

  test("global install writes home and creates symlinks", () => {
    const result = installKhoraCliSkill({
      skillAssetsDir: skillAssets,
      home,
      cwd,
      global: true,
    });
    expect(result.global).toBe(true);
    expect(result.skillDir).toBe(path.join(home, AGENTS_SKILLS_CANONICAL, "khora-cli"));
    const canonical = path.join(home, AGENTS_SKILLS_CANONICAL);
    for (const rel of AGENT_SKILL_SYMLINK_ROOTS) {
      const alt = path.join(home, rel);
      expect(existsSync(alt)).toBe(true);
      expect(lstatSync(alt).isSymbolicLink()).toBe(true);
      expect(realpathSync(alt)).toBe(realpathSync(canonical));
    }
  });

  test("skips when skill dir exists unless force", () => {
    installKhoraCliSkill({ skillAssetsDir: skillAssets, home, cwd });
    writeFileSync(path.join(cwd, AGENTS_SKILLS_CANONICAL, "khora-cli", "SKILL.md"), "# kept\n");
    const skipped = installKhoraCliSkill({ skillAssetsDir: skillAssets, home, cwd });
    expect(skipped.status).toBe("skipped_exists");
    expect(readFileSync(path.join(skipped.skillDir, "SKILL.md"), "utf8")).toBe("# kept\n");

    const forced = installKhoraCliSkill({
      skillAssetsDir: skillAssets,
      home,
      cwd,
      force: true,
    });
    expect(forced.status).toBe("overwritten");
    expect(readFileSync(path.join(forced.skillDir, "SKILL.md"), "utf8")).toContain("khora-cli");
  });

  test("runAgentSkillSetup remains global force install", () => {
    const result = runAgentSkillSetup({ skillAssetsDir: skillAssets, home });
    expect(result.global).toBe(true);
    expect(result.status).toBe("copied");
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
