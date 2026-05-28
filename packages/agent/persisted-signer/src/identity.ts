import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { EdDSASigner } from "iso-signatures/signers/eddsa.js";
import type { PersistableAgentSigner } from "./signer.ts";

export type AgentIdentityFile = {
  did: string;
  /** Multicodec/base64pad-encoded private key produced by the configured signer's `export()`. */
  encoded: string;
};

/** Resolve the identity file path (`ATRIUM_AGENT_KEY_PATH` overrides default `~/.khora/identity.json`). */
export function defaultIdentityPath(): string {
  const override = process.env.ATRIUM_AGENT_KEY_PATH?.trim();
  if (override !== undefined && override.length > 0) return override;
  return path.join(homedir(), ".khora", "identity.json");
}

/** Create a fresh agent identity (default scheme: `did:key` + Ed25519). */
export async function generateAgentIdentity(): Promise<PersistableAgentSigner> {
  return EdDSASigner.generate();
}

/** Load a signer from disk; returns undefined when the file is missing. */
export async function loadIdentity(filePath: string): Promise<PersistableAgentSigner | undefined> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  const parsed = JSON.parse(text) as AgentIdentityFile;
  if (typeof parsed.encoded !== "string" || parsed.encoded.length === 0) {
    throw new Error(`identity file ${filePath} is missing 'encoded'`);
  }
  const signer = await EdDSASigner.import(parsed.encoded);
  if (typeof parsed.did === "string" && parsed.did.length > 0 && parsed.did !== signer.did) {
    throw new Error(
      `identity file ${filePath}: did=${parsed.did} but key encodes did=${signer.did}`,
    );
  }
  return signer;
}

/** Persist signer JSON with `0600` permissions; creates parent dirs as needed. */
export async function saveIdentity(
  filePath: string,
  signer: PersistableAgentSigner,
): Promise<void> {
  const parent = path.dirname(filePath);
  await mkdir(parent, { recursive: true });
  const payload: AgentIdentityFile = { did: signer.did, encoded: signer.export() };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await chmod(filePath, 0o600);
}

/** Return an existing signer or generate and persist a new one. */
export async function loadOrCreateIdentity(filePath: string): Promise<PersistableAgentSigner> {
  const existing = await loadIdentity(filePath);
  if (existing !== undefined) return existing;
  const signer = await generateAgentIdentity();
  await saveIdentity(filePath, signer);
  return signer;
}
