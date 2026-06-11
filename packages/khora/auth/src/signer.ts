import type { RelaySigner } from "@khoralabs/agent-persisted-signer";
import {
  type SignAgentRequestInput as RelaySignAgentRequestInput,
  signAgentRequest as relaySignAgentRequest,
  type SignedAgentRequest,
} from "@khoralabs/relay-client";
import { AGENT_REQUEST_SEARCH, canonicalAgentRequestPath } from "./wire";

export type SignAgentRequestInput = Omit<RelaySignAgentRequestInput, "signer"> & {
  signer: RelaySigner;
};

export type { SignedAgentRequest };

export async function signAgentRequest(input: SignAgentRequestInput): Promise<SignedAgentRequest> {
  return relaySignAgentRequest(input);
}

export type SignedInboxUrlInput = {
  baseUrl: string;
  /** Defaults to `/v1/inbox/ws`. */
  path?: string;
  signer: RelaySigner;
  now?: () => number;
  nonce?: () => string;
};

/**
 * Build a signed WebSocket URL for the inbox upgrade. Carries `did/ts/nonce/sig` query params
 * (the host has no headers available pre-upgrade).
 */
export async function signedInboxUrl(input: SignedInboxUrlInput): Promise<string> {
  const path = input.path ?? "/v1/inbox/ws";
  const root = new URL(input.baseUrl.trim().replace(/\/$/, ""));
  const ws = new URL(path, root);
  ws.protocol = root.protocol === "https:" ? "wss:" : "ws:";
  const signedPath = canonicalAgentRequestPath(ws.pathname, ws.searchParams, []);
  const signed = await signAgentRequest({
    method: "GET",
    path: signedPath,
    bodyText: "",
    signer: input.signer,
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.nonce !== undefined ? { nonce: input.nonce } : {}),
  });
  ws.searchParams.set(AGENT_REQUEST_SEARCH.did, signed.envelope.did);
  ws.searchParams.set(AGENT_REQUEST_SEARCH.ts, String(signed.envelope.timestampMs));
  ws.searchParams.set(AGENT_REQUEST_SEARCH.nonce, signed.envelope.nonce);
  ws.searchParams.set(AGENT_REQUEST_SEARCH.sig, signed.envelope.signatureB64Url);
  return ws.toString();
}
