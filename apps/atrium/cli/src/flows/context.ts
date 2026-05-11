import { AtriumClient } from "@cfd/atrium-client";
import type { EdDSASigner } from "iso-signatures/signers/eddsa.js";
import { defaultIdentityPath, loadIdentity } from "../identity.ts";
import { resolveAtriumCliPlugins } from "../resolve-atrium-plugins.ts";
import type { ReadLineFn } from "./obp/bind-readline.ts";
import { createReadlineSession } from "./readline-session.ts";

export type AtriumCliContext = {
  client: AtriumClient;
  signer: EdDSASigner;
  baseUrl: string;
  identityPath: string;
  readLine: ReadLineFn;
  closeReadline: () => void;
};

export function baseUrlFromEnv(): string {
  return process.env.ATRIUM_BASE_URL?.trim() || "http://127.0.0.1:8787";
}

/**
 * Build the standard CLI context: load (or fail with a hint) the agent identity, then wire it to
 * an {@link AtriumClient} that signs every request.
 *
 * Throws when the identity file is missing — call {@link createAtriumCliContextWithSigner} from
 * `key generate` to bypass this requirement.
 */
export async function createAtriumCliContext(): Promise<AtriumCliContext> {
  const identityPath = defaultIdentityPath();
  const signer = await loadIdentity(identityPath);
  if (signer === undefined) {
    throw new Error(
      `No agent identity at ${identityPath}. Run 'atrium key generate' to create one.`,
    );
  }
  return createAtriumCliContextWithSigner(signer, identityPath);
}

export function createAtriumCliContextWithSigner(
  signer: EdDSASigner,
  identityPath: string,
): AtriumCliContext {
  const pluginsPayload = resolveAtriumCliPlugins();
  const baseUrl = baseUrlFromEnv();
  const rl = createReadlineSession();
  const client = new AtriumClient({
    baseUrl,
    signer,
    dataDir: pluginsPayload.dataDir,
    plugins: pluginsPayload.plugins,
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
