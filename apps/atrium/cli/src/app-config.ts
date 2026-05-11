import {
  atriumAppConfigFromEnv,
  type AtriumPluginInstaller,
  extendAtriumAppConfig,
  type InferAtriumAppConfig,
  loadAtriumAppConfig,
  resolveAtriumConfigPath,
} from "@cfd/atrium-client";
import { buildCliPluginInstallers } from "./plugin-registry.ts";

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

export function createCliAppConfig(opts: {
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
} = {}): CliAppConfigBundle {
  const env = opts.env ?? process.env;
  const flagPath = extractConfigFlagFromArgv(opts.argv ?? process.argv);
  const resolved = resolveAtriumConfigPath({ flag: flagPath, env });
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
