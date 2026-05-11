import { AtriumClient } from "@cfd/atrium-client";
import { resolveAtriumCliPlugins } from "../resolve-atrium-plugins.ts";
import type { ReadLineFn } from "./obp/bind-readline.ts";
import { createReadlineSession } from "./readline-session.ts";

export type AtriumCliContext = {
  client: AtriumClient;
  baseUrl: string;
  readLine: ReadLineFn;
  closeReadline: () => void;
};

export function baseUrlFromEnv(): string {
  return process.env.ATRIUM_BASE_URL?.trim() || "http://127.0.0.1:8787";
}

export function createAtriumCliContext(): AtriumCliContext {
  const pluginsPayload = resolveAtriumCliPlugins();
  const baseUrl = baseUrlFromEnv();
  const rl = createReadlineSession();
  const client = new AtriumClient({
    baseUrl,
    dataDir: pluginsPayload.dataDir,
    plugins: pluginsPayload.plugins,
  });
  return {
    client,
    baseUrl,
    readLine: rl.readLine,
    closeReadline: rl.close,
  };
}
