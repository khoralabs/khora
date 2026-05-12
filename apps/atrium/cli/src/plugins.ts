export {
  ATRIUM_BUILTIN_PLUGIN_ID,
  type AtriumAppConfigBase,
  type AtriumAppPluginMap,
  AtriumConfigError,
  type AtriumPluginInstaller,
  extendAtriumAppConfig,
  type LabeledAtriumPluginInstaller,
  labelAtriumPlugin,
  loadAtriumAppConfig,
  mergeLabeledAtriumPluginLayers,
} from "@khoralabs/atrium-client";
export {
  type CliAppConfig,
  cliAppConfig,
  cliAppConfigExtends,
  cliAppConfigSource,
  cliPluginInstallers,
  createCliAppConfig,
  extractConfigFlagFromArgv,
  zCliAppConfig,
} from "./app-config.ts";
export { buildCliPluginInstallers } from "./plugin-registry.ts";
export {
  type AtriumPluginCollisionPolicy,
  resolveAtriumCliPlugins,
} from "./resolve-atrium-plugins.ts";
