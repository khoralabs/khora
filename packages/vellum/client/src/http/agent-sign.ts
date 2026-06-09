import type { AgentSigner } from "@khoralabs/agent-persisted-signer";

const AGENT_REQUEST_HEADER = {
  did: "X-Agent-Did",
  ts: "X-Agent-Timestamp",
  nonce: "X-Agent-Nonce",
  sig: "X-Agent-Signature",
} as const;

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i] as number);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256B64Url(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(buf));
}

async function canonicalAgentRequestMessage(p: {
  method: string;
  path: string;
  timestampMs: number;
  nonce: string;
  bodyText: string;
}): Promise<Uint8Array> {
  const bodyHash = await sha256B64Url(p.bodyText);
  const message = `${p.method.toUpperCase()}\n${p.path}\n${p.timestampMs}\n${p.nonce}\n${bodyHash}`;
  return new TextEncoder().encode(message);
}

function randomAgentRequestNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function signAgentRequest(input: {
  method: string;
  path: string;
  bodyText: string;
  signer: AgentSigner;
}): Promise<Record<string, string>> {
  const timestampMs = Date.now();
  const nonce = randomAgentRequestNonce();
  const message = await canonicalAgentRequestMessage({
    method: input.method,
    path: input.path,
    timestampMs,
    nonce,
    bodyText: input.bodyText,
  });
  const sigBytes = await input.signer.sign(message);
  return {
    [AGENT_REQUEST_HEADER.did]: input.signer.did,
    [AGENT_REQUEST_HEADER.ts]: String(timestampMs),
    [AGENT_REQUEST_HEADER.nonce]: nonce,
    [AGENT_REQUEST_HEADER.sig]: bytesToBase64Url(sigBytes),
  };
}

export async function signedAgentFetch(
  baseUrl: string,
  input: {
    method: string;
    path: string;
    bodyText?: string;
    signer: AgentSigner;
  },
): Promise<Response> {
  const bodyText = input.bodyText ?? "";
  const headers = await signAgentRequest({
    method: input.method,
    path: input.path,
    bodyText,
    signer: input.signer,
  });
  const url = new URL(input.path, baseUrl.replace(/\/$/, ""));
  return fetch(url, {
    method: input.method,
    headers: {
      ...headers,
      ...(bodyText.length > 0 ? { "content-type": "application/json" } : {}),
    },
    body: bodyText.length > 0 ? bodyText : undefined,
  });
}
