import type { AtriumPluginInstaller, LabeledAtriumPluginInstaller } from "@cfd/atrium-client";
import { ATRIUM_BUILTIN_PLUGIN_ID, labelAtriumPlugin } from "@cfd/atrium-client";
import { inboxBufferPlugin } from "@cfd/atrium-plugin-inbox-buffer";
import { profileSyncPlugin } from "@cfd/atrium-plugin-profile-sync";
import { telemetryPlugin } from "@cfd/atrium-plugin-telemetry";

const DEFAULT_TELEMETRY_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Build labeled {@link AtriumClient} plugin installers from environment variables.
 *
 * - `ATRIUM_DATA_DIR` — optional root for relative plugin paths
 * - `ATRIUM_PROFILE_SYNC_PATH` + `ATRIUM_AGENT_DID` — profile sync JSON file
 * - `ATRIUM_TELEMETRY_DIR` — JSONL telemetry directory; optional `ATRIUM_TELEMETRY_MAX_BYTES` (default 4MiB)
 * - `ATRIUM_INBOX_BUFFER_DB` — SQLite path for event buffer
 */
export function atriumLabeledPluginsFromProcessEnv(env: NodeJS.ProcessEnv = process.env): {
  dataDir: string | undefined;
  labeledPlugins: LabeledAtriumPluginInstaller[];
} {
  const dataDirRaw = env.ATRIUM_DATA_DIR?.trim();
  const dataDir = dataDirRaw !== undefined && dataDirRaw.length > 0 ? dataDirRaw : undefined;
  const labeledPlugins: LabeledAtriumPluginInstaller[] = [];
  const did = env.ATRIUM_AGENT_DID?.trim();

  const profilePath = env.ATRIUM_PROFILE_SYNC_PATH?.trim();
  if (profilePath !== undefined && profilePath.length > 0 && did !== undefined && did.length > 0) {
    labeledPlugins.push(
      labelAtriumPlugin(
        ATRIUM_BUILTIN_PLUGIN_ID.profileSync,
        profileSyncPlugin({ did, filePath: profilePath }),
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
