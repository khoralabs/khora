import {
  type AtriumPluginInstaller,
  labelAtriumPlugin,
  type LabeledAtriumPluginInstaller,
  mergeLabeledAtriumPluginLayers,
} from "@cfd/atrium-client";
import { buildCliPluginInstallers } from "./plugin-registry.ts";
import { createCliAppConfig } from "./app-config.ts";

export type AtriumPluginCollisionPolicy = "first-wins" | "last-wins";

/**
 * Resolve plugin installers from the CLI's merged app-config (env + config file) plus optional
 * extra labeled layers. Default **last-wins** so later layers override the merged config for the
 * same id.
 */
export function resolveAtriumCliPlugins(options?: {
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
  extraLayers?: readonly (readonly LabeledAtriumPluginInstaller[])[];
  collision?: AtriumPluginCollisionPolicy;
}): { dataDir: string | undefined; plugins: AtriumPluginInstaller[] } {
  const collision = options?.collision ?? "last-wins";
  const bundle = createCliAppConfig({ argv: options?.argv, env: options?.env });
  const labeledFromConfig = buildCliPluginInstallers(bundle.config.plugins);
  const layers: readonly (readonly LabeledAtriumPluginInstaller[])[] = [
    labeledFromConfig,
    ...(options?.extraLayers ?? []),
  ];
  const plugins = mergeLabeledAtriumPluginLayers(layers, collision);
  return { dataDir: bundle.config.dataDir, plugins };
}

/** Re-export so consumers can label their own installers without importing the client directly. */
export { labelAtriumPlugin };
