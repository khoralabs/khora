import type { AtriumPluginInstaller, LabeledAtriumPluginInstaller } from "@cfd/atrium-client";
import { mergeLabeledAtriumPluginLayers } from "@cfd/atrium-client";
import { atriumLabeledPluginsFromProcessEnv } from "./plugins-env.ts";

export type AtriumPluginCollisionPolicy = "first-wins" | "last-wins";

/**
 * Resolve plugin installers: env layer plus optional extra labeled layers, with collision policy.
 * Default **last-wins** so later layers (e.g. user loader) override env for the same id.
 */
export function resolveAtriumCliPlugins(options?: {
  env?: NodeJS.ProcessEnv;
  extraLayers?: readonly (readonly LabeledAtriumPluginInstaller[])[];
  collision?: AtriumPluginCollisionPolicy;
}): { dataDir: string | undefined; plugins: AtriumPluginInstaller[] } {
  const env = options?.env ?? process.env;
  const collision = options?.collision ?? "last-wins";
  const { dataDir, labeledPlugins } = atriumLabeledPluginsFromProcessEnv(env);
  const layers: readonly (readonly LabeledAtriumPluginInstaller[])[] = [
    labeledPlugins,
    ...(options?.extraLayers ?? []),
  ];
  const plugins = mergeLabeledAtriumPluginLayers(layers, collision);
  return { dataDir, plugins };
}
