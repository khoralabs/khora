import { defaultIdentityPath, loadIdentity, type PersistableAgentSigner } from "@cfd/atrium-auth";
import { AtriumClient } from "@cfd/atrium-client";
import { cliAppConfig, cliPluginInstallers } from "../app-config.ts";
import type { ReadLineFn } from "./obp/bind-readline.ts";
import { createReadlineSession } from "./readline-session.ts";

export type AtriumCliContext = {
  client: AtriumClient;
  signer: PersistableAgentSigner;
  baseUrl: string;
  identityPath: string;
  readLine: ReadLineFn;
  closeReadline: () => void;
};

export function baseUrlFromEnv(): string {
  return cliAppConfig.baseUrl ?? "http://127.0.0.1:8787";
}

export function identityPathFromConfig(): string {
  return cliAppConfig.agentKeyPath ?? defaultIdentityPath();
}

/**
 * Build the standard CLI context: load (or fail with a hint) the agent identity, then wire it to
 * an {@link AtriumClient} that signs every request.
 *
 * Throws when the identity file is missing — call {@link createAtriumCliContextWithSigner} from
 * `key generate` to bypass this requirement.
 */
export async function createAtriumCliContext(): Promise<AtriumCliContext> {
  const identityPath = identityPathFromConfig();
  const signer = await loadIdentity(identityPath);
  if (signer === undefined) {
    throw new Error(
      `No agent identity at ${identityPath}. Run 'atrium key generate' to create one.`,
    );
  }
  return createAtriumCliContextWithSigner(signer, identityPath);
}

export function createAtriumCliContextWithSigner(
  signer: PersistableAgentSigner,
  identityPath: string,
): AtriumCliContext {
  const baseUrl = baseUrlFromEnv();
  const rl = createReadlineSession();
  const client = new AtriumClient({
    baseUrl,
    signer,
    dataDir: cliAppConfig.dataDir,
    plugins: cliPluginInstallers,
  });
  return {
    client,
    signer,
    baseUrl,
    identityPath,
    readLine: rl.readLine,
    closeReadline: rl.close,
  };
}
