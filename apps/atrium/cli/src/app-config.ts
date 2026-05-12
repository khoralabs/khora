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
import { buildCliPluginInstallers } from "./plugin-registry.ts";

/**
 * `~/.atrium/cli.config.json` first, then legacy `~/.atrium/config.json`. Reads HOME / USERPROFILE
 * from the passed env so tests (and any caller with a sandboxed environment) can override the
 * developer's real home directory.
 */
function cliDefaultConfigPaths(env: NodeJS.ProcessEnv): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  const dir = path.join(home, ".atrium");
  return [path.join(dir, "cli.config.json"), path.join(dir, "config.json")];
}

export const zCliAppConfig = extendAtriumAppConfig({
  // Reserved for CLI-specific keys. Empty today.
});
export type CliAppConfig = InferAtriumAppConfig<typeof zCliAppConfig>;

/** Pull `--config <path>` (or `--config=<path>`) out of an argv array. */
export function extractConfigFlagFromArgv(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--config") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) return next;
      return undefined;
    }
    if (a.startsWith("--config=")) {
      return a.slice("--config=".length);
    }
  }
  return undefined;
}

export type CliAppConfigBundle = {
  config: CliAppConfig;
  sourcePath: string | undefined;
  extendsChain: string[];
  installers: AtriumPluginInstaller[];
};

export function createCliAppConfig(
  opts: { argv?: readonly string[]; env?: NodeJS.ProcessEnv } = {},
): CliAppConfigBundle {
  const env = opts.env ?? process.env;
  const flagPath = extractConfigFlagFromArgv(opts.argv ?? process.argv);
  const resolved = resolveAtriumConfigPath({
    flag: flagPath,
    env,
    defaultPaths: cliDefaultConfigPaths(env),
  });
  const { config, sourcePath, extendsChain } = loadAtriumAppConfig({
    schema: zCliAppConfig,
    layers: [atriumAppConfigFromEnv(env)],
    filePath: resolved?.path ?? null,
    filePathExplicit: resolved?.explicit ?? false,
  });
  const installers = buildCliPluginInstallers(config.plugins).map((p) => p.install);
  return { config, sourcePath, extendsChain, installers };
}

const _bundle = createCliAppConfig();
export const cliAppConfig: CliAppConfig = _bundle.config;
export const cliAppConfigSource: string | undefined = _bundle.sourcePath;
export const cliAppConfigExtends: string[] = _bundle.extendsChain;
export const cliPluginInstallers: AtriumPluginInstaller[] = _bundle.installers;
