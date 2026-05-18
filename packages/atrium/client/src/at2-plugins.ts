import { isAbsolute, resolve } from "node:path";

/** Per-plugin teardown (idempotent). */
export type At2PluginHandle = {
  stop(): void;
};

/**
 * Runs after `At2Client` construction; receives the client and path resolver based on optional
 * {@link At2ClientOptions.dataDir}. Absolute paths pass through `resolvePath`.
 */
export type At2PluginContext = {
  readonly client: import("./at2-client.js").At2Client;
  resolvePath(rel: string): string;
};

/** Factory invoked synchronously by `At2Client` for each configured plugin. */
export type At2PluginInstaller = (ctx: At2PluginContext) => At2PluginHandle;

/** Built-in ids for env-loaded plugins (use for deduplication / user overrides). */
export const AT2_BUILTIN_PLUGIN_ID = {
  profileSync: "at2.plugin.profile-sync",
  telemetry: "at2.plugin.telemetry",
  inboxBuffer: "at2.plugin.inbox-buffer",
} as const;

/** Installer with stable {@link id} for merging layers (CLI/daemon/user loaders). */
export type LabeledAt2PluginInstaller = {
  id: string;
  install: At2PluginInstaller;
};

export function labelAt2Plugin(id: string, install: At2PluginInstaller): LabeledAt2PluginInstaller {
  return { id, install };
}

/**
 * Merge labeled installers from multiple sources (e.g. env layer + user loader).
 * Layers are applied in order; within each layer, order is preserved.
 * - **last-wins**: later entries with the same `id` replace earlier installs (typical: extras override env).
 * - **first-wins**: first registration for an `id` wins.
 */
export function mergeLabeledAt2PluginLayers(
  layers: readonly (readonly LabeledAt2PluginInstaller[])[],
  collision: "first-wins" | "last-wins",
): At2PluginInstaller[] {
  const flat: LabeledAt2PluginInstaller[] = [];
  for (const layer of layers) {
    for (const entry of layer) flat.push(entry);
  }
  if (collision === "first-wins") {
    const installById = new Map<string, At2PluginInstaller>();
    const order: string[] = [];
    for (const { id, install } of flat) {
      if (installById.has(id)) continue;
      installById.set(id, install);
      order.push(id);
    }
    return order.map((id) => {
      const inst = installById.get(id);
      if (inst === undefined) throw new Error(`at2: missing install for id ${id}`);
      return inst;
    });
  }
  const installById = new Map<string, At2PluginInstaller>();
  for (const { id, install } of flat) {
    installById.set(id, install);
  }
  const seen = new Set<string>();
  const order: string[] = [];
  for (const { id } of flat) {
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  return order.map((id) => {
    const inst = installById.get(id);
    if (inst === undefined) throw new Error(`at2: missing install for id ${id}`);
    return inst;
  });
}

/** Join `rel` to `dataDir` when `dataDir` is set and `rel` is not absolute (and not `:memory:`). */
export function createAt2ResolvePath(dataDir: string | undefined): (rel: string) => string {
  return (rel: string) => {
    if (rel === ":memory:") return rel;
    if (isAbsolute(rel)) return rel;
    if (dataDir === undefined || dataDir.trim().length === 0) {
      return resolve(rel);
    }
    return resolve(dataDir.trim(), rel);
  };
}
