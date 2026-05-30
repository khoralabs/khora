import type { Database } from "bun:sqlite";
import type {
  AuthenticatedAgentVerifyContext,
  AuthPreflight,
  InboxAccessVerifyContext,
  PrincipalRegistrationRequest,
  RegistrationVerifyContext,
} from "@khoralabs/agent-relay";
import type { NonceStore } from "./nonce-store";
import { createSqliteNonceStore } from "./sqlite-nonce-store";
import type { AuthStrategy } from "./strategy";
import { createDidKeyEd25519Strategy } from "./strategy-did-key";
import {
  AGENT_REQUEST_FRESHNESS_WINDOW_MS,
  AGENT_REQUEST_HEADER,
  type AgentRequestEnvelope,
  canonicalAgentRequestPath,
  parseAgentRequestEnvelopeFromHeaders,
  parseAgentRequestEnvelopeFromSearch,
} from "./wire";

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/** Public error raised by {@link KhoraDidAuth} guards; carries an HTTP status hint. */
export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export type KhoraDidAuthOptions = {
  /** Pluggable per-scheme signature verifier. Defaults to {@link createDidKeyEd25519Strategy}. */
  strategy?: AuthStrategy;
  nonceStore: NonceStore;
  /** Override clock (ms); defaults to `Date.now`. */
  now?: () => number;
  /** Acceptable timestamp drift in ms; defaults to {@link AGENT_REQUEST_FRESHNESS_WINDOW_MS}. */
  freshnessWindowMs?: number;
  /** Min ms between opportunistic nonce sweeps. Defaults to 60s. */
  sweepIntervalMs?: number;
};

export type CreateKhoraDidAuthOptions = Omit<KhoraDidAuthOptions, "nonceStore"> & {
  /**
   * Bun SQLite database. Used to build the default {@link NonceStore}; ignored when a custom
   * `nonceStore` is provided.
   */
  db?: Database;
  /** Custom replay-protection store (overrides the SQLite default). */
  nonceStore?: NonceStore;
};

/**
 * Lifecycle owner for Khora DID authentication. Construct one per host process, hand
 * {@link KhoraDidAuth.preflight} to `AgentRelay`, and use `requireAuthenticatedRequest` /
 * `requireInboxAccess` / `verifyRegistration` to guard HTTP routes.
 *
 * Swapping the auth scheme = passing a different {@link AuthStrategy}; route code is unaffected.
 */
export class KhoraDidAuth {
  readonly preflight: AuthPreflight;
  private readonly strategy: AuthStrategy;
  private readonly nonceStore: NonceStore;
  private readonly now: () => number;
  private readonly freshnessWindowMs: number;
  private readonly sweepIntervalMs: number;
  private lastSweepMs = 0;

  constructor(opts: KhoraDidAuthOptions) {
    this.strategy = opts.strategy ?? createDidKeyEd25519Strategy();
    this.nonceStore = opts.nonceStore;
    this.now = opts.now ?? (() => Date.now());
    this.freshnessWindowMs = opts.freshnessWindowMs ?? AGENT_REQUEST_FRESHNESS_WINDOW_MS;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.preflight = {
      verifyRegistration: (ctx) => this.verifyRegistrationContext(ctx),
      verifyAuthenticatedAgent: (ctx) => this.verifyAuthenticatedContext(ctx),
      verifyInboxAccess: (ctx) => this.verifyInboxContext(ctx),
    };
  }

  /**
   * Extract the agent DID + envelope from request headers, run full signature verification, and
   * return the authenticated DID. Throws {@link AuthError} on any failure.
   */
  async requireAuthenticatedRequest(
    req: Request,
    url: URL,
    bodyText = "",
    signedQueryKeys: readonly string[] = [],
  ): Promise<{ did: string }> {
    const did = readDidHeader(req);
    if (did === undefined) {
      throw new AuthError(`${AGENT_REQUEST_HEADER.did} header required`, 400);
    }
    await this.verifyAuthenticatedContext({
      method: req.method,
      path: canonicalAgentRequestPath(url.pathname, url.searchParams, signedQueryKeys),
      headers: req.headers,
      claimedPrincipalId: did,
      bodyText,
    }).catch((e) => {
      throw new AuthError(messageOf(e), 401);
    });
    return { did };
  }

  /**
   * Variant of {@link requireAuthenticatedRequest} for the inbox HTTP and WebSocket routes:
   * accepts the agent DID via `?did=` search param when the `X-Agent-Did` header is absent
   * (WebSocket upgrades cannot carry custom headers in browsers).
   */
  async requireInboxAccess(
    req: Request,
    url: URL,
    signedQueryKeys: readonly string[] = [],
  ): Promise<{ did: string }> {
    const did = url.searchParams.get("did")?.trim() || readDidHeader(req);
    if (did === undefined || did.length === 0) {
      throw new AuthError(`did required (query ?did= or ${AGENT_REQUEST_HEADER.did})`, 400);
    }
    await this.verifyInboxContext({
      claimedPrincipalId: did,
      path: canonicalAgentRequestPath(url.pathname, url.searchParams, signedQueryKeys),
      searchParams: url.searchParams,
      headers: req.headers,
    }).catch((e) => {
      throw new AuthError(messageOf(e), 401);
    });
    return { did };
  }

  /**
   * Registration-time verification: the signed body DID must match the claimed registration DID,
   * and the signature must verify over the raw POST body bytes. Designed to be called once before
   * `AgentRelay.registerPrincipal` (which calls the same preflight internally via the registration
   * context — see {@link KhoraDidAuth.preflight}).
   */
  async verifyRegistration(
    req: Request,
    bodyText: string,
    swarmReq: PrincipalRegistrationRequest,
  ): Promise<void> {
    await this.verifyRegistrationContext({
      request: swarmReq,
      headers: req.headers,
      bodyText,
    }).catch((e) => {
      throw new AuthError(messageOf(e), 401);
    });
  }

  /**
   * Same trust model as registration: signature covers `POST /v1/unregister` and the raw JSON body;
   * body DID must match the signing DID.
   */
  async verifyUnregister(
    req: Request,
    bodyText: string,
    swarmReq: PrincipalRegistrationRequest,
  ): Promise<void> {
    await this.verifyUnregisterContext({
      request: swarmReq,
      headers: req.headers,
      bodyText,
    }).catch((e) => {
      throw new AuthError(messageOf(e), 401);
    });
  }

  private async verifyUnregisterContext(ctx: RegistrationVerifyContext): Promise<void> {
    const envelope = parseAgentRequestEnvelopeFromHeaders(ctx.headers);
    if (envelope !== undefined && envelope.did !== ctx.request.principalId) {
      throw new Error("unregister body DID does not match signature DID");
    }
    await this.verifyEnvelope({
      envelope,
      claimedDid: ctx.request.principalId,
      method: "POST",
      path: "/v1/unregister",
      bodyText: ctx.bodyText,
    });
  }

  private async verifyRegistrationContext(ctx: RegistrationVerifyContext): Promise<void> {
    const envelope = parseAgentRequestEnvelopeFromHeaders(ctx.headers);
    if (envelope !== undefined && envelope.did !== ctx.request.principalId) {
      throw new Error("registration body DID does not match signature DID");
    }
    await this.verifyEnvelope({
      envelope,
      claimedDid: ctx.request.principalId,
      method: "POST",
      path: "/v1/register",
      bodyText: ctx.bodyText,
    });
  }

  private async verifyAuthenticatedContext(ctx: AuthenticatedAgentVerifyContext): Promise<void> {
    const envelope = parseAgentRequestEnvelopeFromHeaders(ctx.headers);
    await this.verifyEnvelope({
      envelope,
      claimedDid: ctx.claimedPrincipalId,
      method: ctx.method,
      path: ctx.path,
      bodyText: ctx.bodyText ?? "",
    });
  }

  private async verifyInboxContext(ctx: InboxAccessVerifyContext): Promise<void> {
    const envelope =
      parseAgentRequestEnvelopeFromSearch(ctx.searchParams) ??
      parseAgentRequestEnvelopeFromHeaders(ctx.headers);
    await this.verifyEnvelope({
      envelope,
      claimedDid: ctx.claimedPrincipalId,
      method: "GET",
      path: ctx.path,
      bodyText: "",
    });
  }

  private async verifyEnvelope(p: {
    envelope: AgentRequestEnvelope | undefined;
    claimedDid: string;
    method: string;
    path: string;
    bodyText: string;
  }): Promise<void> {
    const { envelope, claimedDid, method, path, bodyText } = p;
    if (envelope === undefined) {
      throw new Error("missing agent request signature");
    }
    if (envelope.did !== claimedDid) {
      throw new Error("agent DID mismatch");
    }
    const t = this.now();
    if (Math.abs(t - envelope.timestampMs) > this.freshnessWindowMs) {
      throw new Error("agent request timestamp out of window");
    }
    await this.maybeSweep(t);
    const inserted = await this.nonceStore.tryInsert({
      did: envelope.did,
      nonce: envelope.nonce,
      expiresAtMs: envelope.timestampMs + this.freshnessWindowMs,
    });
    if (!inserted) {
      throw new Error("agent request nonce reuse");
    }
    await this.strategy.verifyEnvelope({ envelope, method, path, bodyText });
  }

  private async maybeSweep(t: number): Promise<void> {
    if (t - this.lastSweepMs < this.sweepIntervalMs) return;
    this.lastSweepMs = t;
    await this.nonceStore.sweepExpired(t);
  }
}

function readDidHeader(req: Request): string | undefined {
  const v = req.headers.get(AGENT_REQUEST_HEADER.did)?.trim();
  return v !== undefined && v.length > 0 ? v : undefined;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Factory wrapping {@link KhoraDidAuth} with sensible defaults: SQLite-backed nonce store and
 * the did:key Ed25519 strategy. Pass a custom `nonceStore` or `strategy` to override.
 */
export function createKhoraDidAuth(opts: CreateKhoraDidAuthOptions): KhoraDidAuth {
  const nonceStore =
    opts.nonceStore ??
    (opts.db !== undefined
      ? createSqliteNonceStore(opts.db)
      : (() => {
          throw new Error("createKhoraDidAuth: provide `db` or `nonceStore`");
        })());
  return new KhoraDidAuth({
    nonceStore,
    ...(opts.strategy !== undefined ? { strategy: opts.strategy } : {}),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.freshnessWindowMs !== undefined ? { freshnessWindowMs: opts.freshnessWindowMs } : {}),
    ...(opts.sweepIntervalMs !== undefined ? { sweepIntervalMs: opts.sweepIntervalMs } : {}),
  });
}
