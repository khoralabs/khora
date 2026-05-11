import {
  ATRIUM_BUILTIN_PLUGIN_ID,
  type AtriumAppPluginMap,
  type AtriumPluginInstaller,
  labelAtriumPlugin,
  type LabeledAtriumPluginInstaller,
} from "@cfd/atrium-client";
import { profileSyncPlugin } from "@cfd/atrium-plugin-profile-sync";
import { telemetryPlugin } from "@cfd/atrium-plugin-telemetry";

// CLI runs short-lived commands that emit mutation events (profile/post/topic); profile-sync and
// telemetry consume those. inbox-buffer is owned by the daemon — if a shared config declares it,
// this registry silently skips it (the daemon handles it instead).
const CLI_INSTALLERS: Record<string, (options: unknown) => AtriumPluginInstaller> = {
  [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: (o) =>
    profileSyncPlugin(o as Parameters<typeof profileSyncPlugin>[0]),
  [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: (o) =>
    telemetryPlugin(o as Parameters<typeof telemetryPlugin>[0]),
};

/**
 * Materialize the CLI's slice of an `AtriumAppPluginMap`. Unknown ids (e.g. those owned by another
 * host or with a typo) and ids set to `false` are silently skipped.
 */
export function buildCliPluginInstallers(
  pluginMap: AtriumAppPluginMap | undefined,
): LabeledAtriumPluginInstaller[] {
  if (pluginMap === undefined) return [];
  const out: LabeledAtriumPluginInstaller[] = [];
  for (const [id, value] of Object.entries(pluginMap)) {
    if (value === undefined || value === false) continue;
    const make = CLI_INSTALLERS[id];
    if (make === undefined) continue;
    out.push(labelAtriumPlugin(id, make(value)));
  }
  return out;
}
