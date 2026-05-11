#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { EdDSASigner } from "iso-signatures/signers/eddsa.js";
import { runInboxDaemon } from "./run-inbox-daemon.ts";

function identityPath(): string {
  const override = process.env.ATRIUM_AGENT_KEY_PATH?.trim();
  if (override !== undefined && override.length > 0) return override;
  return path.join(homedir(), ".atrium", "identity.json");
}

async function loadSigner(): Promise<EdDSASigner> {
  const p = identityPath();
  let text: string;
  try {
    text = await readFile(p, "utf8");
  } catch {
    console.error(`No agent identity at ${p}. Run 'atrium key generate' first.`);
    process.exit(1);
  }
  const parsed = JSON.parse(text) as { encoded?: string };
  if (typeof parsed.encoded !== "string" || parsed.encoded.length === 0) {
    console.error(`Identity file ${p} missing 'encoded'.`);
    process.exit(1);
  }
  return EdDSASigner.import(parsed.encoded);
}

const baseUrl = process.env.ATRIUM_BASE_URL?.trim() || "http://127.0.0.1:8787";
const json =
  process.argv.includes("--json") ||
  process.env.ATRIUM_DAEMON_JSON === "1" ||
  process.env.ATRIUM_DAEMON_JSON === "true";

const signer = await loadSigner();
const handle = runInboxDaemon({ baseUrl, signer, json });

process.on("SIGINT", () => {
  handle.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  handle.close();
  process.exit(0);
});
