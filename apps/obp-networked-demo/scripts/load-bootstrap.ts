import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ObpClientBootstrap, ObpServerBootstrap } from "@cfd/obp-auth";

export async function loadServerBootstrapFile(path?: string): Promise<ObpServerBootstrap> {
  const p = resolve(
    process.cwd(),
    path ?? process.env.OBP_DEMO_SERVER_BOOTSTRAP ?? ".obp-demo-server.local.json",
  );
  return JSON.parse(await readFile(p, "utf-8")) as ObpServerBootstrap;
}

export async function loadClientBootstrapFile(path?: string): Promise<ObpClientBootstrap> {
  const p = resolve(
    process.cwd(),
    path ?? process.env.OBP_DEMO_CLIENT_BOOTSTRAP ?? ".obp-demo-client.local.json",
  );
  return JSON.parse(await readFile(p, "utf-8")) as ObpClientBootstrap;
}

export type { ObpClientBootstrap, ObpServerBootstrap } from "@cfd/obp-auth";
export { initiatorSignerFromBootstrap, responderSignerFromBootstrap } from "@cfd/obp-auth";
