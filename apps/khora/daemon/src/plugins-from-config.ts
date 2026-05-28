import type { KhoraAppConfigBase, KhoraPluginInstaller } from "@khoralabs/khora-client";
import { KHORA_BUILTIN_PLUGIN_ID } from "@khoralabs/khora-client";
import { createInboxBufferPlugin } from "@khoralabs/khora-plugin-inbox-buffer";

export function pluginsFromDaemonConfig(cfg: KhoraAppConfigBase): KhoraPluginInstaller[] {
  const plugins: KhoraPluginInstaller[] = [];
  const inboxOpts = cfg.plugins?.[KHORA_BUILTIN_PLUGIN_ID.inboxBuffer];
  if (inboxOpts !== undefined && inboxOpts !== false) {
    plugins.push(createInboxBufferPlugin(inboxOpts));
  }
  return plugins;
}
