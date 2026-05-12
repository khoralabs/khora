import {
  type AtriumPluginInstaller,
  type LabeledAtriumPluginInstaller,
  labelAtriumPlugin,
  mergeLabeledAtriumPluginLayers,
} from "@khoralabs/atrium-client";
import { createDaemonAppConfig } from "./app-config.ts";
import { buildDaemonPluginInstallers } from "./plugin-registry.ts";

export type AtriumPluginCollisionPolicy = "first-wins" | "last-wins";

/**
 * Resolve plugin installers from the daemon's merged app-config (env + config file) plus optional
 * extra labeled layers. Default **last-wins** so later layers override the merged config for the
 * same id.
 */
export function resolveAtriumDaemonPlugins(options?: {
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
  extraLayers?: readonly (readonly LabeledAtriumPluginInstaller[])[];
  collision?: AtriumPluginCollisionPolicy;
}): { dataDir: string | undefined; plugins: AtriumPluginInstaller[] } {
  const collision = options?.collision ?? "last-wins";
  const bundle = createDaemonAppConfig({ argv: options?.argv, env: options?.env });
  const labeledFromConfig = buildDaemonPluginInstallers(bundle.config.plugins);
  const layers: readonly (readonly LabeledAtriumPluginInstaller[])[] = [
    labeledFromConfig,
    ...(options?.extraLayers ?? []),
  ];
  const plugins = mergeLabeledAtriumPluginLayers(layers, collision);
  return { dataDir: bundle.config.dataDir, plugins };
}

export { labelAtriumPlugin };
