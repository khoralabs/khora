import { isAbsolute, resolve } from "node:path";
import type { KhoraClient } from "./khora-client.ts";

/** Per-plugin teardown (idempotent). */
export type KhoraPluginHandle = {
  stop(): void;
};

/**
 * Runs after `KhoraClient` construction; receives the client and path resolver based on optional
 * {@link KhoraClientOptions.dataDir}. Absolute paths pass through `resolvePath`.
 */
export type KhoraPluginContext = {
  readonly client: KhoraClient;
  resolvePath(rel: string): string;
};

/** Factory invoked synchronously by `KhoraClient` for each configured plugin. */
export type KhoraPluginInstaller = (ctx: KhoraPluginContext) => KhoraPluginHandle;

/** Built-in ids for env-loaded plugins (use for deduplication / user overrides). */
export const KHORA_BUILTIN_PLUGIN_ID = {
  profileSync: "khora.plugin.profile-sync",
  telemetry: "khora.plugin.telemetry",
  inboxBuffer: "khora.plugin.inbox-buffer",
} as const;

/** Installer with stable {@link id} for merging layers (CLI/daemon/user loaders). */
export type LabeledKhoraPluginInstaller = {
  id: string;
  install: KhoraPluginInstaller;
};

export function labelKhoraPlugin(
  id: string,
  install: KhoraPluginInstaller,
): LabeledKhoraPluginInstaller {
  return { id, install };
}

/**
 * Merge labeled installers from multiple sources (e.g. env layer + user loader).
 * Layers are applied in order; within each layer, order is preserved.
 * - **last-wins**: later entries with the same `id` replace earlier installs (typical: extras override env).
 * - **first-wins**: first registration for an `id` wins.
 */
export function mergeLabeledKhoraPluginLayers(
  layers: readonly (readonly LabeledKhoraPluginInstaller[])[],
  collision: "first-wins" | "last-wins",
): KhoraPluginInstaller[] {
  const flat: LabeledKhoraPluginInstaller[] = [];
  for (const layer of layers) {
    for (const entry of layer) flat.push(entry);
  }
  if (collision === "first-wins") {
    const installById = new Map<string, KhoraPluginInstaller>();
    const order: string[] = [];
    for (const { id, install } of flat) {
      if (installById.has(id)) continue;
      installById.set(id, install);
      order.push(id);
    }
    return order.map((id) => {
      const inst = installById.get(id);
      if (inst === undefined) throw new Error(`khora: missing install for id ${id}`);
      return inst;
    });
  }
  const installById = new Map<string, KhoraPluginInstaller>();
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
    if (inst === undefined) throw new Error(`khora: missing install for id ${id}`);
    return inst;
  });
}

/** Join `rel` to `dataDir` when `dataDir` is set and `rel` is not absolute (and not `:memory:`). */
export function createKhoraResolvePath(dataDir: string | undefined): (rel: string) => string {
  return (rel: string) => {
    if (rel === ":memory:") return rel;
    if (isAbsolute(rel)) return rel;
    if (dataDir === undefined || dataDir.trim().length === 0) {
      return resolve(rel);
    }
    return resolve(dataDir.trim(), rel);
  };
}
