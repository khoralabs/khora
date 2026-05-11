import type { AtriumPluginInstaller, LabeledAtriumPluginInstaller } from "@cfd/atrium-client";
import { ATRIUM_BUILTIN_PLUGIN_ID, labelAtriumPlugin } from "@cfd/atrium-client";
import { inboxBufferPlugin } from "@cfd/atrium-plugin-inbox-buffer";

/**
 * Build labeled {@link AtriumClient} plugin installers from environment variables.
 *
 * The daemon only emits `inbox:*` events (it never calls mutating client methods), so it ships
 * with the inbox-buffer plugin only. Use the CLI for profile-sync / telemetry, or layer extra
 * installers in programmatically via `resolveAtriumDaemonPlugins({ extraLayers })`.
 *
 * - `ATRIUM_DATA_DIR` — optional root for relative plugin paths
 * - `ATRIUM_INBOX_BUFFER_DB` — SQLite path for event buffer
 */
export function atriumLabeledPluginsFromProcessEnv(env: NodeJS.ProcessEnv = process.env): {
  dataDir: string | undefined;
  labeledPlugins: LabeledAtriumPluginInstaller[];
} {
  const dataDirRaw = env.ATRIUM_DATA_DIR?.trim();
  const dataDir = dataDirRaw !== undefined && dataDirRaw.length > 0 ? dataDirRaw : undefined;
  const labeledPlugins: LabeledAtriumPluginInstaller[] = [];

  const inboxDb = env.ATRIUM_INBOX_BUFFER_DB?.trim();
  if (inboxDb !== undefined && inboxDb.length > 0) {
    labeledPlugins.push(
      labelAtriumPlugin(
        ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer,
        inboxBufferPlugin({ dbPath: inboxDb }),
      ),
    );
  }

  return { dataDir, labeledPlugins };
}

/**
 * Same as {@link atriumLabeledPluginsFromProcessEnv} but returns unlabeled installers only (env order preserved).
 */
export function atriumPluginsFromProcessEnv(env: NodeJS.ProcessEnv = process.env): {
  dataDir: string | undefined;
  plugins: AtriumPluginInstaller[];
} {
  const { dataDir, labeledPlugins } = atriumLabeledPluginsFromProcessEnv(env);
  return { dataDir, plugins: labeledPlugins.map((p) => p.install) };
}
