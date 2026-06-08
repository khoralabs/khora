import * as fs from "node:fs";
import * as path from "node:path";

/** Authoritative global skills root (tool-agnostic convention). */
export const AGENTS_SKILLS_CANONICAL = path.join(".agents", "skills");

/** Other tools' global skill roots — symlinked to the canonical root when safe. */
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

export type AgentSkillInstallResult = {
  skillDir: string;
  copied: string[];
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

export function runAgentSkillSetup(opts: {
  skillAssetsDir: string;
  home: string;
}): AgentSkillInstallResult {
  if (!fs.existsSync(opts.skillAssetsDir)) {
    throw new Error(`agent skill assets not found at ${opts.skillAssetsDir}`);
  }

  const canonicalRoot = path.join(opts.home, AGENTS_SKILLS_CANONICAL);
  const skillDir = path.join(canonicalRoot, "khora-cli");
  fs.mkdirSync(canonicalRoot, { recursive: true });

  const copied: string[] = [];
  copyDirRecursive(opts.skillAssetsDir, skillDir, copied);

  const symlinks = AGENT_SKILL_SYMLINK_ROOTS.map((rel) => {
    const alternatePath = path.join(opts.home, rel);
    return {
      path: alternatePath,
      status: linkAgentSkillsRoot(alternatePath, canonicalRoot),
    };
  });

  return { skillDir, copied, symlinks };
}
