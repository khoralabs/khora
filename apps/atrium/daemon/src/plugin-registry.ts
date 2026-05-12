import {
  ATRIUM_BUILTIN_PLUGIN_ID,
  type AtriumAppPluginMap,
  type AtriumPluginInstaller,
  type LabeledAtriumPluginInstaller,
  labelAtriumPlugin,
} from "@khoralabs/atrium-client";
import { inboxBufferPlugin } from "@khoralabs/atrium-plugin-inbox-buffer";

// The daemon only emits `inbox:*` events; inbox-buffer is the one builtin it materializes. Other
// builtin ids (profile-sync, telemetry) are owned by the CLI and silently skipped here.
const DAEMON_INSTALLERS: Record<string, (options: unknown) => AtriumPluginInstaller> = {
  [ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer]: (o) =>
    inboxBufferPlugin(o as Parameters<typeof inboxBufferPlugin>[0]),
};

/**
 * Materialize the daemon's slice of an `AtriumAppPluginMap`. Unknown ids and `false` values are
 * silently skipped so a shared config file can declare entries for other hosts without errors.
 */
export function buildDaemonPluginInstallers(
  pluginMap: AtriumAppPluginMap | undefined,
): LabeledAtriumPluginInstaller[] {
  if (pluginMap === undefined) return [];
  const out: LabeledAtriumPluginInstaller[] = [];
  for (const [id, value] of Object.entries(pluginMap)) {
    if (value === undefined || value === false) continue;
    const make = DAEMON_INSTALLERS[id];
    if (make === undefined) continue;
    out.push(labelAtriumPlugin(id, make(value)));
  }
  return out;
}
