import * as fs from "node:fs";
import * as path from "node:path";

/** Authoritative skills root relative to home or project cwd. */
export const AGENTS_SKILLS_CANONICAL = path.join(".agents", "skills");

export const KHORA_CLI_SKILL_NAME = "khora-cli";

/** Other tools' global skill roots — symlinked to the canonical root when safe (global install only). */
export const AGENT_SKILL_SYMLINK_ROOTS = [
  path.join(".cursor", "skills"),
  path.join(".gemini", "skills"),
  path.join(".agent", "skills"),
  path.join(".gemini", "antigravity", "skills"),
] as const;

export type AgentSkillSymlinkStatus =
  | "created"
  | "already_linked"
  | "skipped_exists"
  | "skipped_different_link"
  | "skipped_error";

export type AgentSkillInstallStatus = "copied" | "skipped_exists" | "overwritten";

export type AgentSkillInstallResult = {
  skillDir: string;
  status: AgentSkillInstallStatus;
  copied: string[];
  global: boolean;
  symlinks: { path: string; status: AgentSkillSymlinkStatus }[];
};

function copyDirRecursive(src: string, dest: string, copied: string[], rel = ""): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name);
    const destPath = path.join(dest, name);
    const relPath = rel.length > 0 ? `${rel}/${name}` : name;
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath, copied, relPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      copied.push(relPath);
    }
  }
}

function rmDirRecursive(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function resolveExistingLink(target: string): string | null {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

export function linkAgentSkillsRoot(
  alternatePath: string,
  canonicalPath: string,
): AgentSkillSymlinkStatus {
  const canonicalReal = resolveExistingLink(canonicalPath) ?? canonicalPath;

  if (fs.existsSync(alternatePath)) {
    const stat = fs.lstatSync(alternatePath);
    if (stat.isSymbolicLink()) {
      const target = resolveExistingLink(alternatePath);
      if (target === canonicalReal) return "already_linked";
      return "skipped_different_link";
    }
    return "skipped_exists";
  }

  fs.mkdirSync(path.dirname(alternatePath), { recursive: true });
  try {
    fs.symlinkSync(canonicalPath, alternatePath, "dir");
    return "created";
  } catch {
    return "skipped_error";
  }
}

export type InstallKhoraCliSkillOptions = {
  skillAssetsDir: string;
  /** Home directory (required when `global` is true for symlink roots). */
  home?: string;
  /** Project cwd for local installs (default process.cwd()). */
  cwd?: string;
  /** When true, install under `home/.agents/skills`; otherwise under `cwd/.agents/skills`. */
  global?: boolean;
  /** When true, replace an existing skill directory. */
  force?: boolean;
};

/**
 * Install the bundled khora-cli skill tree.
 * Default target is `<cwd>/.agents/skills/khora-cli`. With `global: true`, uses `~/.agents/skills`
 * and optionally links other agent skill roots to that canonical directory.
 */
export function installKhoraCliSkill(opts: InstallKhoraCliSkillOptions): AgentSkillInstallResult {
  if (!fs.existsSync(opts.skillAssetsDir)) {
    throw new Error(`agent skill assets not found at ${opts.skillAssetsDir}`);
  }

  const isGlobal = opts.global === true;
  const home = opts.home?.trim() ?? "";
  if (isGlobal && home.length === 0) {
    throw new Error("HOME / USERPROFILE not set; cannot install global skills");
  }
  const rootBase = isGlobal ? home : (opts.cwd ?? process.cwd());
  const canonicalRoot = path.join(rootBase, AGENTS_SKILLS_CANONICAL);
  const skillDir = path.join(canonicalRoot, KHORA_CLI_SKILL_NAME);
  const force = opts.force === true;

  if (fs.existsSync(skillDir) && !force) {
    return {
      skillDir,
      status: "skipped_exists",
      copied: [],
      global: isGlobal,
      symlinks: [],
    };
  }

  const status: AgentSkillInstallStatus = fs.existsSync(skillDir) ? "overwritten" : "copied";
  if (fs.existsSync(skillDir)) {
    rmDirRecursive(skillDir);
  }

  fs.mkdirSync(canonicalRoot, { recursive: true });
  const copied: string[] = [];
  copyDirRecursive(opts.skillAssetsDir, skillDir, copied);

  const symlinks = isGlobal
    ? AGENT_SKILL_SYMLINK_ROOTS.map((rel) => {
        const alternatePath = path.join(home, rel);
        return {
          path: alternatePath,
          status: linkAgentSkillsRoot(alternatePath, canonicalRoot),
        };
      })
    : [];

  return { skillDir, status, copied, global: isGlobal, symlinks };
}

/** @deprecated Prefer {@link installKhoraCliSkill} with `global: true`. */
export function runAgentSkillSetup(opts: {
  skillAssetsDir: string;
  home: string;
}): AgentSkillInstallResult {
  return installKhoraCliSkill({
    skillAssetsDir: opts.skillAssetsDir,
    home: opts.home,
    global: true,
    force: true,
  });
}
