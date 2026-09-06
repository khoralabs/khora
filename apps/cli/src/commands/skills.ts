import { existsSync } from "node:fs";
import path from "node:path";
import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";

import {
  type AgentSkillInstallResult,
  installKhoraCliSkill,
} from "../../scripts/install-agent-skill";
import { style, symbols } from "../lib/style";

const ASSETS_DIR_ENV = "KHORA_CLI_ASSETS_DIR";

function resolveSkillAssetsDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[ASSETS_DIR_ENV]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return path.join(fromEnv, "skills", "khora-cli");
  }
  const pkgRoot = path.resolve(import.meta.dir, "../..");
  return path.join(pkgRoot, "assets", "skills", "khora-cli");
}

export function printSkillInstallResult(skill: AgentSkillInstallResult): void {
  if (skill.status === "skipped_exists") {
    console.log(
      `${symbols.warning} ${style.warn(`skipped agent skill khora-cli (exists at ${skill.skillDir}; use --force to overwrite)`)}`,
    );
    return;
  }
  const verb = skill.status === "overwritten" ? "overwrote" : "wrote";
  console.log(`${symbols.success} ${verb} agent skill ${style.muted("khora-cli")}`);
  console.log(
    `${symbols.info} ${style.muted(`at ${skill.skillDir}${skill.global ? " (global)" : " (cwd)"}`)}`,
  );
  for (const link of skill.symlinks) {
    if (link.status === "created") {
      console.log(`${symbols.success} linked ${style.muted(link.path)} → ~/.agents/skills`);
    } else if (link.status === "already_linked") {
      console.log(`${symbols.info} ${style.muted(`${link.path} already linked`)}`);
    }
  }
}

/** Shared by `setup -y` and `skills install`. */
export function installBundledKhoraCliSkill(opts: {
  global: boolean;
  force: boolean;
  /** Required when `global` is true. */
  home?: string;
  cwd?: string;
}): AgentSkillInstallResult {
  const skillAssetsDir = resolveSkillAssetsDir();
  if (!existsSync(skillAssetsDir)) {
    throw new Error(`setup: skill assets not found at ${skillAssetsDir}`);
  }
  return installKhoraCliSkill({
    skillAssetsDir,
    home: opts.home,
    cwd: opts.cwd,
    global: opts.global,
    force: opts.force,
  });
}

export async function handleSkillsInstall(flags: FlagMap): Promise<void> {
  const yes = boolFlag(flags, "yes", "y");
  if (!yes) {
    throw new Error("Usage: khora skills install -y [-g] [--force] [--json]");
  }
  const force = boolFlag(flags, "force", "f");
  const global = boolFlag(flags, "global", "g");
  const asJson = boolFlag(flags, "json");
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (global && (home === undefined || home.length === 0)) {
    throw new Error("HOME / USERPROFILE not set; cannot install global skills");
  }

  const skill = installBundledKhoraCliSkill({
    global,
    force,
    ...(home !== undefined && home.length > 0 ? { home } : {}),
    cwd: process.cwd(),
  });

  if (asJson) {
    console.log(JSON.stringify(skill, null, 2));
    return;
  }
  printSkillInstallResult(skill);
}
