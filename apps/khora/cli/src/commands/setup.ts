import { existsSync } from "node:fs";
import path from "node:path";
import {
  generateAgentIdentity,
  loadIdentity,
  saveIdentity,
} from "@khoralabs/agent-persisted-signer";
import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";
import { KhoraClient } from "@khoralabs/khora-client";
import {
  type AgentSkillInstallResult,
  runAgentSkillSetup,
} from "../../scripts/install-agent-skill";
import {
  type KhoraSetupResult,
  POSTINSTALL_SCHEMA_FILE,
  runKhoraConfigSetup,
} from "../../scripts/postinstall";
import {
  agentIdentityPath,
  assertInteractiveAllowed,
  cliBaseUrl,
  cliCurrentHostSlug,
  createKhoraCliContext,
} from "../flows/context";
import { runRegisterInteractiveFlow } from "../flows/register-flow";
import { nameFromFlags } from "../lib/flags";
import { style, symbols } from "../lib/style";
import { fetchHosts } from "../registry/client";
import { cliRegistryUrl } from "../registry/config";

const ASSETS_DIR_ENV = "KHORA_CLI_ASSETS_DIR";

export type SetupAssets = {
  configsDir: string;
  schemaPath: string | undefined;
  skillAssetsDir: string;
};

const SCHEMA_FILE = POSTINSTALL_SCHEMA_FILE;

/**
 * Locate canonical configs + schema for `khora setup`.
 *
 * Published install: `KHORA_CLI_ASSETS_DIR` points at the meta-package root (contains
 * `configs/`, `skills/`, and `khora-config.schema.json`).
 *
 * Monorepo: `apps/khora/cli/assets/configs`, `assets/skills/khora-cli`, and
 * `packages/khora/client/khora-config.schema.json`.
 */
export function resolveSetupAssets(env: NodeJS.ProcessEnv = process.env): SetupAssets {
  const fromEnv = env[ASSETS_DIR_ENV]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    const schema = path.join(fromEnv, SCHEMA_FILE);
    return {
      configsDir: path.join(fromEnv, "configs"),
      schemaPath: existsSync(schema) ? schema : undefined,
      skillAssetsDir: path.join(fromEnv, "skills", "khora-cli"),
    };
  }
  const pkgRoot = path.resolve(import.meta.dir, "../..");
  const schema = path.resolve(
    pkgRoot,
    "..",
    "..",
    "..",
    "packages",
    "khora",
    "client",
    SCHEMA_FILE,
  );
  const schemaPath = existsSync(schema) ? schema : undefined;
  return {
    configsDir: path.join(pkgRoot, "assets", "configs"),
    schemaPath,
    skillAssetsDir: path.join(pkgRoot, "assets", "skills", "khora-cli"),
  };
}

export function printSetupSummary(result: KhoraSetupResult, skill?: AgentSkillInstallResult): void {
  for (const name of result.copied) {
    console.log(`${symbols.success} wrote ${style.muted(name)}`);
  }
  for (const name of result.overwritten) {
    console.log(`${symbols.success} overwrote ${style.muted(name)}`);
  }
  for (const name of result.skipped) {
    console.log(
      `${symbols.warning} ${style.warn(`skipped ${name} (exists; use --force to overwrite)`)}`,
    );
  }
  if (result.schema === "copied") {
    console.log(`${symbols.success} wrote ${style.muted(SCHEMA_FILE)}`);
  } else if (result.schema === "overwritten") {
    console.log(`${symbols.success} overwrote ${style.muted(SCHEMA_FILE)}`);
  } else if (result.schema === "skipped") {
    console.log(
      `${symbols.warning} ${style.warn(`skipped ${SCHEMA_FILE} (exists; use --force to overwrite)`)}`,
    );
  } else {
    console.log(
      `${symbols.info} ${style.muted(`skipped ${SCHEMA_FILE} (source not found; run 'bun run --cwd packages/khora/client build:schema' in dev)`)}`,
    );
  }
  console.log(`${symbols.info} ${style.muted(`at ${result.destDir}`)}`);

  if (skill !== undefined) {
    console.log(`${symbols.success} wrote agent skill ${style.muted("khora-cli")}`);
    console.log(`${symbols.info} ${style.muted(`at ${skill.skillDir}`)}`);
    for (const link of skill.symlinks) {
      if (link.status === "created") {
        console.log(`${symbols.success} linked ${style.muted(link.path)} → ~/.agents/skills`);
      } else if (link.status === "already_linked") {
        console.log(`${symbols.info} ${style.muted(`${link.path} already linked`)}`);
      }
    }
  }
}

export async function runSetupCommand(flags: FlagMap): Promise<void> {
  const force = boolFlag(flags, "force", "f");
  const asJson = boolFlag(flags, "json");
  // -y / --yes: non-interactive one-liner using auto-selected host and provided profile flags
  const yes = boolFlag(flags, "yes", "y");
  const assets = resolveSetupAssets();
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home === undefined || home.length === 0) {
    throw new Error("HOME / USERPROFILE not set; cannot determine ~/.khora location");
  }
  if (!existsSync(assets.configsDir)) {
    throw new Error(
      `setup: canonical configs directory not found at ${assets.configsDir} (set ${ASSETS_DIR_ENV} or run from a packaged install)`,
    );
  }

  // Step 1: install config files + skill (existing behaviour)
  const result = runKhoraConfigSetup({
    configsDir: assets.configsDir,
    schemaPath: assets.schemaPath,
    home,
    force,
  });
  let skill: AgentSkillInstallResult | undefined;
  if (existsSync(assets.skillAssetsDir)) {
    skill = runAgentSkillSetup({ skillAssetsDir: assets.skillAssetsDir, home });
  }
  if (asJson) {
    // JSON mode: emit the file-install result now; onboarding below may overwrite with richer output
  } else {
    printSetupSummary(result, skill);
  }

  // Onboarding (keygen → host → register) only runs when -y is passed or the shell is
  // interactive (process.stdin is a TTY). Tests and piped/non-interactive callers that
  // omit -y get only the file-install step above.
  const isTTY = Boolean(process.stdin.isTTY);
  if (!yes && !isTTY) {
    if (asJson) console.log(JSON.stringify({ ...result, skill }));
    return;
  }

  // Step 2: keygen (skip if identity already exists)
  const keyPath = agentIdentityPath(flags);
  const existingIdentity = await loadIdentity(keyPath);
  let did: string;
  if (existingIdentity !== undefined) {
    did = existingIdentity.did;
    if (!asJson) console.log(`${symbols.info} ${style.muted(`identity already exists: ${did}`)}`);
  } else {
    const signer = await generateAgentIdentity();
    await saveIdentity(keyPath, signer);
    did = signer.did;
    if (!asJson) console.log(`${symbols.success} generated identity ${style.muted(did)}`);
  }

  // Step 3: host selection — auto-pick lowest-latency "up" host, or prompt
  const registryUrl = cliRegistryUrl(flags);
  const hosts = await fetchHosts(registryUrl);
  const upHosts = hosts.filter((h) => h.health?.status === "up");
  const hostPool = upHosts.length > 0 ? upHosts : hosts;

  let chosenSlug: string;
  const currentSlug = cliCurrentHostSlug(flags);

  if (currentSlug !== undefined) {
    // already configured — skip re-selection
    chosenSlug = currentSlug;
    if (!asJson) console.log(`${symbols.info} ${style.muted(`host already set: ${chosenSlug}`)}`);
  } else if (yes) {
    // auto-select: lowest latency among up hosts
    const sorted = [...hostPool].sort(
      (a, b) => (a.health?.latencyMs ?? Infinity) - (b.health?.latencyMs ?? Infinity),
    );
    const picked = sorted[0];
    if (picked === undefined) throw new Error("No hosts available in registry.");
    chosenSlug = picked.slug;
    // write the selection into config
    const { patchCliConfigFile, resolveCliConfigWritePath } = await import(
      "../lib/cli-config-write"
    );
    const { khoraCliResolvedConfig } = await import("../khora-app-config");
    const configPath = resolveCliConfigWritePath(flags);
    const cfg = khoraCliResolvedConfig(flags);
    const hostsMap = {
      ...(cfg.hosts ?? {}),
      [chosenSlug]: {
        baseUrl: picked.baseUrl,
        ...(picked.displayName !== undefined ? { displayName: picked.displayName } : {}),
      },
    };
    patchCliConfigFile(configPath, { currentHost: chosenSlug, hosts: hostsMap });
    if (!asJson)
      console.log(`${symbols.success} selected host ${style.bold(chosenSlug)} (${picked.baseUrl})`);
  } else {
    // interactive host selection
    assertInteractiveAllowed("Pass -y to auto-select a host non-interactively.");
    if (hostPool.length === 0) throw new Error("No hosts available in registry.");
    if (hostPool.length === 1) {
      // biome-ignore lint/style/noNonNullAssertion: length checked above
      chosenSlug = hostPool[0]!.slug;
    } else {
      console.log("\nAvailable hosts:");
      hostPool.forEach((h, i) => {
        const latency = h.health?.latencyMs !== undefined ? ` — ${h.health.latencyMs}ms` : "";
        console.log(`  ${i + 1}. ${h.slug}${latency}${h.displayName ? ` (${h.displayName})` : ""}`);
      });
      const ctx = createKhoraCliContext();
      try {
        const answer = await ctx.readLine("Select host (number or slug): ");
        const n = Number.parseInt(answer.trim(), 10);
        if (Number.isFinite(n) && n >= 1 && n <= hostPool.length) {
          // biome-ignore lint/style/noNonNullAssertion: bounds checked above
          chosenSlug = hostPool[n - 1]!.slug;
        } else {
          const matched = hostPool.find((h) => h.slug === answer.trim());
          if (matched === undefined) throw new Error(`Unknown host: ${answer.trim()}`);
          chosenSlug = matched.slug;
        }
      } finally {
        ctx.closeReadline();
      }
    }
    const { patchCliConfigFile, resolveCliConfigWritePath } = await import(
      "../lib/cli-config-write"
    );
    const { khoraCliResolvedConfig } = await import("../khora-app-config");
    const configPath = resolveCliConfigWritePath(flags);
    const cfg = khoraCliResolvedConfig(flags);
    const chosen = hostPool.find((h) => h.slug === chosenSlug);
    if (chosen === undefined) throw new Error(`Unknown host: ${chosenSlug}`);
    const hostsMap = {
      ...(cfg.hosts ?? {}),
      [chosenSlug]: {
        baseUrl: chosen.baseUrl,
        ...(chosen.displayName !== undefined ? { displayName: chosen.displayName } : {}),
      },
    };
    patchCliConfigFile(configPath, { currentHost: chosenSlug, hosts: hostsMap });
    if (!asJson)
      console.log(`${symbols.success} selected host ${style.bold(chosenSlug)} (${chosen.baseUrl})`);
  }

  // Step 4: register (skip if already registered)
  const signer = await loadIdentity(keyPath);
  if (signer === undefined) throw new Error("No identity found");

  const baseUrl = cliBaseUrl(flags);
  const ac = new KhoraClient({ baseUrl, signer });
  try {
    const existing = await ac.lookupProfileByDid(signer.did);
    if (existing !== null) {
      if (!asJson)
        console.log(
          `${symbols.info} ${style.muted(`already registered as @${existing.profile.username}`)}`,
        );
      if (asJson)
        console.log(
          JSON.stringify({ ...result, skill, did, host: chosenSlug, profile: existing.profile }),
        );
      return;
    }
  } catch {
    // host unreachable or lookup failed — fall through to register attempt
  }

  let username: string;
  let displayName: string;
  let bio: string;
  let inviteToken: string | undefined;

  const usernameFlag = strFlag(flags, "username")?.trim() ?? "";
  const nameFlag = nameFromFlags(flags)?.trim() ?? "";
  const bioFlag = strFlag(flags, "bio")?.trim() ?? "";

  if (yes) {
    if (usernameFlag.length === 0 || nameFlag.length === 0) {
      throw new Error(
        "khora setup -y requires --username and --name to register non-interactively.",
      );
    }
    username = usernameFlag;
    displayName = nameFlag;
    bio = bioFlag;
    inviteToken = strFlag(flags, "invite-token")?.trim();
  } else {
    assertInteractiveAllowed(
      "Pass -y --username <handle> --name <name> to register non-interactively.",
    );
    const ctx = createKhoraCliContext();
    try {
      const prompted = await runRegisterInteractiveFlow(ctx, {
        ...(usernameFlag.length > 0 ? { username: usernameFlag } : {}),
        ...(nameFlag.length > 0 ? { displayName: nameFlag } : {}),
        ...(bioFlag.length > 0 ? { bio: bioFlag } : {}),
      });
      username = prompted.username;
      displayName = prompted.displayName;
      bio = prompted.bio;
      inviteToken = prompted.inviteToken;
    } finally {
      ctx.closeReadline();
    }
  }

  try {
    const out = await ac.register({
      metadata: { username, displayName, bio },
      ...(inviteToken !== undefined && inviteToken.length > 0 ? { inviteToken } : {}),
    });
    if (!asJson) {
      console.log(
        `${symbols.success} registered as ${style.bold(`@${out.profile.username}`)} (${out.did})`,
      );
    }
    if (asJson) {
      console.log(
        JSON.stringify({ ...result, skill, did, host: chosenSlug, profile: out.profile }),
      );
    }
  } finally {
    ac.dispose();
  }
}

export function maybeBootstrapKhoraHome(
  env: NodeJS.ProcessEnv = process.env,
  err: (line: string) => void = (line) => console.log(line),
): void {
  const fromEnv = env[ASSETS_DIR_ENV]?.trim();
  if (fromEnv === undefined || fromEnv.length === 0) return;
  const home = env.HOME ?? env.USERPROFILE;
  if (home === undefined || home.length === 0) return;
  const canary = path.join(home, ".khora", "cli.config.json");
  if (existsSync(canary)) return;
  try {
    const assets = resolveSetupAssets(env);
    if (!existsSync(assets.configsDir)) return;
    runKhoraConfigSetup({
      configsDir: assets.configsDir,
      schemaPath: assets.schemaPath,
      home,
      force: false,
    });
    if (existsSync(assets.skillAssetsDir)) {
      runAgentSkillSetup({ skillAssetsDir: assets.skillAssetsDir, home });
    }
  } catch (e) {
    err(
      style.error(
        `khora: first-run setup failed (${e instanceof Error ? e.message : String(e)}); run 'khora setup' to retry`,
      ),
    );
  }
}
