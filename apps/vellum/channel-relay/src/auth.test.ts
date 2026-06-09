import { expect, test } from "bun:test";
import {
  AGENT_REQUEST_HEADER,
  canonicalAgentRequestMessage,
  createChannelRelayAuth,
  createTestAgent,
  signedPath,
} from "@khoralabs/vellum-channel-host";
import { signAsync } from "@noble/ed25519";

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i] as number);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signedHeaders(
  agent: Awaited<ReturnType<typeof createTestAgent>>,
  method: string,
  path: string,
  bodyText: string,
  now: () => number,
): Promise<Record<string, string>> {
  const timestampMs = now();
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = bytesToBase64Url(nonceBytes);
  const message = await canonicalAgentRequestMessage({
    method,
    path,
    timestampMs,
    nonce,
    bodyText,
  });
  const sig = await signAsync(message, agent.privateKey);
  return {
    [AGENT_REQUEST_HEADER.did]: agent.did,
    [AGENT_REQUEST_HEADER.ts]: String(timestampMs),
    [AGENT_REQUEST_HEADER.nonce]: nonce,
    [AGENT_REQUEST_HEADER.sig]: bytesToBase64Url(sig),
  };
}

test("auth rejects missing signature", async () => {
  const auth = createChannelRelayAuth({ now: () => 1_700_000_000_000 });
  const req = new Request("http://localhost/v1/channels", {
    method: "POST",
    headers: { [AGENT_REQUEST_HEADER.did]: "did:key:z6Mktest" },
    body: "{}",
  });
  await expect(auth.requireAuthenticatedRequest(req, new URL(req.url), "{}", [])).rejects.toThrow(
    "missing agent request signature",
  );
});

test("auth rejects nonce replay", async () => {
  const now = () => 1_700_000_000_000;
  const auth = createChannelRelayAuth({ now });
  const agent = await createTestAgent();
  const path = signedPath("/v1/channels");
  const bodyText = "{}";
  const headers = await signedHeaders(agent, "POST", path, bodyText, now);

  const req1 = new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: bodyText,
  });
  await auth.requireAuthenticatedRequest(req1, new URL(req1.url), bodyText, []);

  const req2 = new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: bodyText,
  });
  await expect(
    auth.requireAuthenticatedRequest(req2, new URL(req2.url), bodyText, []),
  ).rejects.toThrow("nonce reuse");
});
