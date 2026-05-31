import path from "node:path";
import type { WebUiConfig } from "./config";

const DEFAULT_CONFIG = "web-ui.config.ts";

export async function loadWebUiConfig(cwd = process.cwd()): Promise<WebUiConfig> {
  const configArg = process.argv.find((a) => a.startsWith("--config="));
  const configFile = configArg?.slice("--config=".length) ?? DEFAULT_CONFIG;
  const configPath = path.resolve(cwd, configFile);

  const mod = await import(configPath);
  const config = mod.default as WebUiConfig | undefined;
  if (config === undefined || typeof config.serverEntry !== "string") {
    console.error(
      `bun-web: invalid config at ${configPath} (expected default export from defineWebUi)`,
    );
    process.exit(1);
  }
  return config;
}
