import type { Database } from "bun:sqlite";
import {
  AGENT_REQUEST_FRESHNESS_WINDOW_MS,
  type AgentRequestEnvelope,
  type AuthenticatedAgentVerifyContext,
  canonicalAgentRequestMessage,
  type DidVerifier,
  envelopeSignatureBytes,
  type InboxAccessVerifyContext,
  parseAgentRequestEnvelopeFromHeaders,
  parseAgentRequestEnvelopeFromSearch,
  type RegistrationVerifyContext,
} from "@cfd/swarm-host";
import { verifyAsync } from "@noble/ed25519";
import { DIDKey } from "iso-did/key";
import { insertNonceIfFresh, sweepExpiredNonces } from "./persistence/sqlite/index.ts";

const SWEEP_INTERVAL_MS = 60_000;

export type DidKeyDidVerifierOptions = {
  db: Database;
  /** Override for tests; defaults to `Date.now`. */
  nowMs?: () => number;
  /** Freshness window (ms); defaults to `AGENT_REQUEST_FRESHNESS_WINDOW_MS`. */
  freshnessWindowMs?: number;
};

class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DidKeyVerificationError";
  }
}

function publicKeyForDid(did: string): Uint8Array {
  let parsed: DIDKey;
  try {
    parsed = DIDKey.fromString(did);
  } catch {
    throw new VerificationError(`unknown did:key: ${did}`);
  }
  if (parsed.type !== "Ed25519") {
    throw new VerificationError(`unsupported did:key type: ${parsed.type}`);
  }
  return parsed.publicKey;
}

/**
 * Production verifier for `did:key` (Ed25519) agents.
 *
 * Each call performs the same five checks:
 *  1. Envelope is present and well-formed.
 *  2. Envelope DID matches the claimed DID (and the body DID for registration).
 *  3. Timestamp is within the freshness window.
 *  4. `(did, nonce)` is unused (stored in SQLite for replay protection).
 *  5. Ed25519 signature over the canonical message verifies.
 */
export function createDidKeyDidVerifier(opts: DidKeyDidVerifierOptions): DidVerifier {
  const now = opts.nowMs ?? (() => Date.now());
  const window = opts.freshnessWindowMs ?? AGENT_REQUEST_FRESHNESS_WINDOW_MS;
  let lastSweepMs = 0;

  function maybeSweep(t: number): void {
    if (t - lastSweepMs < SWEEP_INTERVAL_MS) return;
    lastSweepMs = t;
    sweepExpiredNonces(opts.db, t);
  }

  async function verifyEnvelope(p: {
    envelope: AgentRequestEnvelope | undefined;
    claimedDid: string;
    method: string;
    path: string;
    bodyText: string;
  }): Promise<void> {
    const { envelope, claimedDid, method, path, bodyText } = p;
    if (envelope === undefined) {
      throw new VerificationError("missing agent request signature");
    }
    if (envelope.did !== claimedDid) {
      throw new VerificationError("agent DID mismatch");
    }
    const t = now();
    if (Math.abs(t - envelope.timestampMs) > window) {
      throw new VerificationError("agent request timestamp out of window");
    }
    maybeSweep(t);
    const inserted = insertNonceIfFresh(opts.db, {
      did: envelope.did,
      nonce: envelope.nonce,
      expiresAtMs: envelope.timestampMs + window,
    });
    if (!inserted) {
      throw new VerificationError("agent request nonce reuse");
    }
    const pubKey = publicKeyForDid(envelope.did);
    const message = await canonicalAgentRequestMessage({
      method,
      path,
      timestampMs: envelope.timestampMs,
      nonce: envelope.nonce,
      bodyText,
    });
    const ok = await verifyAsync(envelopeSignatureBytes(envelope), message, pubKey);
    if (!ok) {
      throw new VerificationError("agent request signature invalid");
    }
  }

  return {
    async verifyRegistration(ctx: RegistrationVerifyContext): Promise<void> {
      const envelope = parseAgentRequestEnvelopeFromHeaders(ctx.headers);
      if (envelope !== undefined && envelope.did !== ctx.request.did) {
        throw new VerificationError("registration body DID does not match signature DID");
      }
      await verifyEnvelope({
        envelope,
        claimedDid: ctx.request.did,
        method: "POST",
        path: "/v1/register",
        bodyText: ctx.bodyText,
      });
    },
    async verifyAuthenticatedAgent(ctx: AuthenticatedAgentVerifyContext): Promise<void> {
      const envelope = parseAgentRequestEnvelopeFromHeaders(ctx.headers);
      await verifyEnvelope({
        envelope,
        claimedDid: ctx.claimedDid,
        method: ctx.method,
        path: ctx.path,
        bodyText: ctx.bodyText ?? "",
      });
    },
    async verifyInboxAccess(ctx: InboxAccessVerifyContext): Promise<void> {
      const envelope =
        parseAgentRequestEnvelopeFromSearch(ctx.searchParams) ??
        parseAgentRequestEnvelopeFromHeaders(ctx.headers);
      await verifyEnvelope({
        envelope,
        claimedDid: ctx.claimedDid,
        method: "GET",
        path: ctx.path,
        bodyText: "",
      });
    },
  };
}
