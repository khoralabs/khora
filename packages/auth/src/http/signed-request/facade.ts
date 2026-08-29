import type { AuthStrategy } from "../../did/strategy";
import { createDidKeyEd25519Strategy } from "../../did/strategy-ed25519-key";
import type { NonceStore } from "../../replay/nonce-store";
import {
  AGENT_REQUEST_FRESHNESS_WINDOW_MS,
  AGENT_REQUEST_HEADER,
  type AgentRequestEnvelope,
  canonicalAgentRequestPath,
  parseAgentRequestEnvelopeFromHeaders,
  parseAgentRequestEnvelopeFromSearch,
} from "./envelope";
import { INBOX_BIND_METHOD, inboxBindCanonicalPath } from "./sign";

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/** Public error raised by {@link SignedRequestAuth} guards; carries an HTTP status hint. */
export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Optional HTTP hints supplied by the adapter. */
export type RegistrationVerifyClientHints = {
  ip?: string;
  userAgent?: string;
};

export type RegistrationVerifyContext = {
  request: { principalId: string };
  client?: RegistrationVerifyClientHints;
  headers: Headers;
  bodyText: string;
};

export type AuthenticatedPrincipalVerifyContext = {
  method: string;
  path: string;
  headers: Headers;
  claimedPrincipalId: string;
  bodyText?: string;
};

export type InboxAccessVerifyContext = {
  claimedPrincipalId: string;
  path: string;
  searchParams: URLSearchParams;
  headers: Headers;
};

/**
 * Optional preflight surface for hosts. Prefer importing the host-local re-export when typing
 * against `PrincipalRegistrationRequest`; this shape stays principal-id agnostic.
 */
export interface SignedRequestPreflight {
  verifyRegistration(ctx: RegistrationVerifyContext): Promise<void>;
  verifyAuthenticatedPrincipal(ctx: AuthenticatedPrincipalVerifyContext): Promise<void>;
  verifyInboxAccess(ctx: InboxAccessVerifyContext): Promise<void>;
}

/** @deprecated Use {@link SignedRequestPreflight}. */
export type AuthPreflight = SignedRequestPreflight;

export type SignedRequestAuthOptions = {
  strategy?: AuthStrategy;
  nonceStore: NonceStore;
  now?: () => number;
  freshnessWindowMs?: number;
  sweepIntervalMs?: number;
  /** After signature verify succeeds, reject principals that must not use signed APIs. */
  assertPrincipalAllowed?: (did: string) => void | Promise<void>;
};

/** @deprecated Use {@link SignedRequestAuthOptions}. */
export type KhoraDidAuthOptions = SignedRequestAuthOptions;
/** @deprecated Use {@link SignedRequestAuthOptions}. */
export type CreateKhoraDidAuthOptions = SignedRequestAuthOptions;
/** @deprecated Use {@link SignedRequestAuthOptions}. */
export type CreateSignedRequestAuthOptions = SignedRequestAuthOptions;

/**
 * Lifecycle owner for DID-signed HTTP request authentication.
 * Swapping the scheme = passing a different {@link AuthStrategy}.
 */
export class SignedRequestAuth {
  readonly preflight: SignedRequestPreflight;
  private readonly strategy: AuthStrategy;
  private readonly nonceStore: NonceStore;
  private readonly now: () => number;
  private readonly freshnessWindowMs: number;
  private readonly sweepIntervalMs: number;
  private readonly assertPrincipalAllowed?: (did: string) => void | Promise<void>;
  private lastSweepMs = 0;

  constructor(opts: SignedRequestAuthOptions) {
    this.strategy = opts.strategy ?? createDidKeyEd25519Strategy();
    this.nonceStore = opts.nonceStore;
    this.now = opts.now ?? (() => Date.now());
    this.freshnessWindowMs = opts.freshnessWindowMs ?? AGENT_REQUEST_FRESHNESS_WINDOW_MS;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.assertPrincipalAllowed = opts.assertPrincipalAllowed;
    this.preflight = {
      verifyRegistration: (ctx) => this.verifyRegistrationContext(ctx),
      verifyAuthenticatedPrincipal: (ctx) => this.verifyAuthenticatedContext(ctx),
      verifyInboxAccess: (ctx) => this.verifyInboxContext(ctx),
    };
  }

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
    await this.runAssertPrincipalAllowed(did);
    return { did };
  }

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
    await this.runAssertPrincipalAllowed(did);
    return { did };
  }

  async verifyInboxBind(opts: {
    connectionId: string;
    envelope: AgentRequestEnvelope;
  }): Promise<{ did: string }> {
    const connectionId = opts.connectionId.trim();
    if (connectionId.length === 0) {
      throw new AuthError("connection_id required", 400);
    }
    try {
      await this.verifyEnvelope({
        envelope: opts.envelope,
        claimedDid: opts.envelope.did,
        method: INBOX_BIND_METHOD,
        path: inboxBindCanonicalPath(connectionId),
        bodyText: "",
      });
    } catch (e) {
      throw new AuthError(messageOf(e), 401);
    }
    await this.runAssertPrincipalAllowed(opts.envelope.did);
    return { did: opts.envelope.did };
  }

  async verifyRegistration(
    req: Request,
    bodyText: string,
    request: { principalId: string },
  ): Promise<void> {
    await this.verifyRegistrationContext({
      request,
      headers: req.headers,
      bodyText,
    }).catch((e) => {
      throw new AuthError(messageOf(e), 401);
    });
  }

  async verifyUnregister(
    req: Request,
    bodyText: string,
    request: { principalId: string },
  ): Promise<void> {
    await this.verifyUnregisterContext({
      request,
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

  private async verifyAuthenticatedContext(
    ctx: AuthenticatedPrincipalVerifyContext,
  ): Promise<void> {
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

  private async runAssertPrincipalAllowed(did: string): Promise<void> {
    if (this.assertPrincipalAllowed === undefined) return;
    try {
      await this.assertPrincipalAllowed(did);
    } catch (e) {
      if (e instanceof AuthError) throw e;
      const msg = messageOf(e);
      if (/forbidden|suspended|deleted/i.test(msg)) {
        throw new AuthError(msg, 403);
      }
      throw e;
    }
  }
}

/** @deprecated Use {@link SignedRequestAuth}. */
export const KhoraDidAuth = SignedRequestAuth;
export type KhoraDidAuth = SignedRequestAuth;

function readDidHeader(req: Request): string | undefined {
  const v = req.headers.get(AGENT_REQUEST_HEADER.did)?.trim();
  return v !== undefined && v.length > 0 ? v : undefined;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function createSignedRequestAuth(opts: SignedRequestAuthOptions): SignedRequestAuth {
  return new SignedRequestAuth({
    nonceStore: opts.nonceStore,
    ...(opts.strategy !== undefined ? { strategy: opts.strategy } : {}),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.freshnessWindowMs !== undefined ? { freshnessWindowMs: opts.freshnessWindowMs } : {}),
    ...(opts.sweepIntervalMs !== undefined ? { sweepIntervalMs: opts.sweepIntervalMs } : {}),
    ...(opts.assertPrincipalAllowed !== undefined
      ? { assertPrincipalAllowed: opts.assertPrincipalAllowed }
      : {}),
  });
}

/** @deprecated Use {@link createSignedRequestAuth}. */
export function createKhoraDidAuth(opts: SignedRequestAuthOptions): SignedRequestAuth {
  return createSignedRequestAuth(opts);
}

export type VerifySignedAgentRequestOptions = {
  bodyText?: string;
  signedQueryKeys?: readonly string[];
};

export async function verifySignedAgentRequest(
  auth: SignedRequestAuth,
  req: Request,
  opts: VerifySignedAgentRequestOptions = {},
): Promise<{ did: string }> {
  const url = new URL(req.url);
  const bodyText = opts.bodyText ?? (await req.clone().text());
  return auth.requireAuthenticatedRequest(req, url, bodyText, opts.signedQueryKeys ?? []);
}
