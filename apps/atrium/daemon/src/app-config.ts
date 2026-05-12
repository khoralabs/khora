import { homedir } from "node:os";
import path from "node:path";
import {
  type AtriumPluginInstaller,
  atriumAppConfigFromEnv,
  extendAtriumAppConfig,
  type InferAtriumAppConfig,
  loadAtriumAppConfig,
  resolveAtriumConfigPath,
} from "@khoralabs/atrium-client";
import { buildDaemonPluginInstallers } from "./plugin-registry.ts";

/**
 * `~/.atrium/daemon.config.json` first, then legacy `~/.atrium/config.json`. Reads HOME /
 * USERPROFILE from the passed env so tests (and any caller with a sandboxed environment) can
 * override the developer's real home directory.
 */
function daemonDefaultConfigPaths(env: NodeJS.ProcessEnv): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  const dir = path.join(home, ".atrium");
  return [path.join(dir, "daemon.config.json"), path.join(dir, "config.json")];
}

export const zDaemonAppConfig = extendAtriumAppConfig({
  // Reserved for daemon-specific keys. Empty today.
});
export type DaemonAppConfig = InferAtriumAppConfig<typeof zDaemonAppConfig>;

export type DaemonArgvFlags = {
  configPath: string | undefined;
  json: boolean;
};

/** Pull `--config <path>` and `--json` out of an argv array. */
export function parseDaemonArgv(argv: readonly string[]): DaemonArgvFlags {
  let configPath: string | undefined;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--config") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        configPath = next;
        i++;
      }
      continue;
    }
    if (a.startsWith("--config=")) {
      configPath = a.slice("--config=".length);
    }
  }
  return { configPath, json };
}

export type DaemonAppConfigBundle = {
  config: DaemonAppConfig;
  sourcePath: string | undefined;
  extendsChain: string[];
  installers: AtriumPluginInstaller[];
  /** Final daemonJson value: argv `--json` > config > env > false. */
  json: boolean;
};

export function createDaemonAppConfig(
  opts: { argv?: readonly string[]; env?: NodeJS.ProcessEnv } = {},
): DaemonAppConfigBundle {
  const env = opts.env ?? process.env;
  const flags = parseDaemonArgv(opts.argv ?? process.argv);
  const resolved = resolveAtriumConfigPath({
    flag: flags.configPath,
    env,
    defaultPaths: daemonDefaultConfigPaths(env),
  });
  const { config, sourcePath, extendsChain } = loadAtriumAppConfig({
    schema: zDaemonAppConfig,
    layers: [atriumAppConfigFromEnv(env)],
    filePath: resolved?.path ?? null,
    filePathExplicit: resolved?.explicit ?? false,
  });
  const installers = buildDaemonPluginInstallers(config.plugins).map((p) => p.install);
  const json = flags.json || config.daemonJson === true;
  return { config, sourcePath, extendsChain, installers, json };
}

const _bundle = createDaemonAppConfig();
export const daemonAppConfig: DaemonAppConfig = _bundle.config;
export const daemonAppConfigSource: string | undefined = _bundle.sourcePath;
export const daemonAppConfigExtends: string[] = _bundle.extendsChain;
export const daemonPluginInstallers: AtriumPluginInstaller[] = _bundle.installers;
export const daemonJsonOutput: boolean = _bundle.json;
