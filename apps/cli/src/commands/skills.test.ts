import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createKhoraCliContext } from "../flows/context";
import { dispatch } from "./handlers";
import { allCommandHelp } from "./help/index";
import { handleSkillsInstall, installBundledKhoraCliSkill } from "./skills";

const skillRoot = path.resolve(import.meta.dir, "../../assets/skills/khora-cli");

describe("skills install command", () => {
  test("requires -y", async () => {
    const ctx = createKhoraCliContext();
    try {
      await expect(dispatch(ctx, ["skills", "install"], {})).rejects.toThrow(/-y/);
    } finally {
      ctx.closeReadline();
    }
  });

  test("help registry includes skills install", () => {
    expect(allCommandHelp.map((h) => h.command)).toContain("skills install");
  });

  describe("execution", () => {
    let workspace: string;
    let home: string;
    let cwd: string;
    let origEnv: NodeJS.ProcessEnv;
    let origCwd: string;

    beforeEach(() => {
      workspace = mkdtempSync(path.join(tmpdir(), "khora-skills-cmd-"));
      home = path.join(workspace, "home");
      cwd = path.join(workspace, "project");
      mkdirSync(home, { recursive: true });
      mkdirSync(cwd, { recursive: true });
      origEnv = { ...process.env };
      origCwd = process.cwd();
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      process.chdir(cwd);
    });

    afterEach(() => {
      process.chdir(origCwd);
      process.env = origEnv;
      rmSync(workspace, { recursive: true, force: true });
    });

    test("installs under cwd with -y", async () => {
      await handleSkillsInstall({ yes: true });
      expect(existsSync(path.join(cwd, ".agents", "skills", "khora-cli", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(home, ".agents", "skills", "khora-cli", "SKILL.md"))).toBe(false);
    });

    test("installs under home with -y -g", async () => {
      await handleSkillsInstall({ yes: true, global: true });
      expect(existsSync(path.join(home, ".agents", "skills", "khora-cli", "SKILL.md"))).toBe(true);
      expect(existsSync(path.join(cwd, ".agents", "skills", "khora-cli", "SKILL.md"))).toBe(false);
    });

    test("--force overwrites an existing skill tree", async () => {
      await handleSkillsInstall({ yes: true });
      const skillMd = path.join(cwd, ".agents", "skills", "khora-cli", "SKILL.md");
      writeFileSync(skillMd, "# kept\n");
      await handleSkillsInstall({ yes: true, force: true });
      expect(readFileSync(skillMd, "utf8")).not.toBe("# kept\n");
      expect(readFileSync(skillMd, "utf8")).toContain("khora-cli");
    });

    test("--json emits structured install result", async () => {
      const lines: string[] = [];
      const log = console.log;
      console.log = (msg: unknown) => {
        lines.push(String(msg));
      };
      try {
        await handleSkillsInstall({ yes: true, json: true });
      } finally {
        console.log = log;
      }
      const parsed = JSON.parse(lines.join("\n")) as {
        status: string;
        global: boolean;
        skillDir: string;
      };
      expect(parsed.status).toBe("copied");
      expect(parsed.global).toBe(false);
      expect(parsed.skillDir.endsWith(path.join(".agents", "skills", "khora-cli"))).toBe(true);
      expect(existsSync(path.join(parsed.skillDir, "SKILL.md"))).toBe(true);
    });

    test("local install succeeds without HOME / USERPROFILE", async () => {
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      await handleSkillsInstall({ yes: true });
      expect(existsSync(path.join(cwd, ".agents", "skills", "khora-cli", "SKILL.md"))).toBe(true);
    });

    test("global install still requires HOME", async () => {
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      await expect(handleSkillsInstall({ yes: true, global: true })).rejects.toThrow(/HOME/);
    });
  });
});

describe("installBundledKhoraCliSkill", () => {
  test("local install does not require home", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "khora-bundled-"));
    try {
      const result = installBundledKhoraCliSkill({ global: false, force: false, cwd });
      expect(result.global).toBe(false);
      expect(result.status).toBe("copied");
      expect(existsSync(path.join(result.skillDir, "SKILL.md"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("bundled skill content", () => {
  test("router and sub-skills mention relationships and NO_INTERACTIVE", () => {
    const router = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
    expect(router).toContain("KHORA_NO_INTERACTIVE");
    expect(router).toContain("connect/SKILL.md");
    expect(router).toContain("skills install -y");

    const connect = readFileSync(path.join(skillRoot, "connect", "SKILL.md"), "utf8");
    expect(connect).toContain("relationships invite");
    expect(connect).toContain("revoke");

    const commands = readFileSync(path.join(skillRoot, "references", "commands.md"), "utf8");
    expect(commands).toContain("relationships list");
    expect(commands).toContain("skills install");
  });
});
