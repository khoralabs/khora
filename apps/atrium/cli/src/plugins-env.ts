import type { AtriumPluginInstaller, LabeledAtriumPluginInstaller } from "@cfd/atrium-client";
import { ATRIUM_BUILTIN_PLUGIN_ID, labelAtriumPlugin } from "@cfd/atrium-client";
import { profileSyncPlugin } from "@cfd/atrium-plugin-profile-sync";
import { telemetryPlugin } from "@cfd/atrium-plugin-telemetry";

const DEFAULT_TELEMETRY_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Build labeled {@link AtriumClient} plugin installers from environment variables.
 *
 * The CLI runs short-lived commands that emit mutation events (`register`, `profile:updated`,
 * `post:*`, `topic:*`, `inbox:list`) which `profile-sync` and `telemetry` consume. The
 * `inbox-buffer` plugin lives on the daemon side because it persists the long-running inbox
 * stream.
 *
 * - `ATRIUM_DATA_DIR` — optional root for relative plugin paths
 * - `ATRIUM_PROFILE_SYNC_PATH` — profile sync JSON file
 * - `ATRIUM_TELEMETRY_DIR` — JSONL telemetry directory; optional `ATRIUM_TELEMETRY_MAX_BYTES` (default 4MiB)
 */
export function atriumLabeledPluginsFromProcessEnv(env: NodeJS.ProcessEnv = process.env): {
  dataDir: string | undefined;
  labeledPlugins: LabeledAtriumPluginInstaller[];
} {
  const dataDirRaw = env.ATRIUM_DATA_DIR?.trim();
  const dataDir = dataDirRaw !== undefined && dataDirRaw.length > 0 ? dataDirRaw : undefined;
  const labeledPlugins: LabeledAtriumPluginInstaller[] = [];

  const profilePath = env.ATRIUM_PROFILE_SYNC_PATH?.trim();
  if (profilePath !== undefined && profilePath.length > 0) {
    labeledPlugins.push(
      labelAtriumPlugin(
        ATRIUM_BUILTIN_PLUGIN_ID.profileSync,
        profileSyncPlugin({ filePath: profilePath }),
      ),
    );
  }

  const telDir = env.ATRIUM_TELEMETRY_DIR?.trim();
  if (telDir !== undefined && telDir.length > 0) {
    const maxRaw = env.ATRIUM_TELEMETRY_MAX_BYTES?.trim();
    const maxFileBytes =
      maxRaw !== undefined && maxRaw.length > 0
        ? Number.parseInt(maxRaw, 10)
        : DEFAULT_TELEMETRY_MAX_BYTES;
    if (!Number.isFinite(maxFileBytes) || maxFileBytes <= 0) {
      throw new Error("ATRIUM_TELEMETRY_MAX_BYTES must be a positive number");
    }
    labeledPlugins.push(
      labelAtriumPlugin(
        ATRIUM_BUILTIN_PLUGIN_ID.telemetry,
        telemetryPlugin({ dir: telDir, maxFileBytes }),
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
