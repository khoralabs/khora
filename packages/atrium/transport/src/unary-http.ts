import {
  type AgentSigner,
  canonicalAgentRequestPath,
  randomAgentRequestNonce,
  signAgentRequest,
} from "@khoralabs/atrium-auth";
import type z from "zod";
import { AtriumClientError } from "./errors.ts";

/** Subset of `fetch` used by the client (avoids requiring Bun-specific properties on mocks). */
export type AtriumFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Structured query input for `requestJson` / `requestVoid`. */
export type RequestQuery = Record<string, string>;

export type RequestJsonOptions<T> = {
  body?: unknown;
  headers?: Record<string, string>;
  parse: z.ZodType<T>;
  /** Query params to append to the fetch URL. */
  query?: RequestQuery;
  /**
   * Subset of `query` keys to include in the canonical signed path, in canonical order.
   * Defaults to `Object.keys(query)`. Pass an explicit ordered list when the server expects a
   * specific allowlist (currently `/v1/inbox` requires `["limit", "markRead"]`).
   */
  signedQueryKeys?: readonly string[];
};

export type RequestVoidOptions = {
  query?: RequestQuery;
  signedQueryKeys?: readonly string[];
  body?: unknown;
};

/** Unary host RPC surface (default binding: signed HTTP). */
export type AtriumUnaryTransport = {
  readonly base: string;
  readonly did: string;
  readonly signer: AgentSigner;
  readonly now: () => number;
  readonly nonce: () => string;
  fetch(path: string, init?: RequestInit): Promise<Response>;
  requestJson<T>(method: string, path: string, opts: RequestJsonOptions<T>): Promise<T>;
  requestVoid(method: string, path: string, opts?: RequestVoidOptions): Promise<void>;
};

export type CreateHttpTransportOptions = {
  baseUrl: string;
  signer: AgentSigner;
  fetch?: AtriumFetch;
  nowMs?: () => number;
  nonceFactory?: () => string;
};

/** Creates the default HTTP unary transport with DID-signed requests. */
export function createHttpAtriumUnaryTransport(
  opts: CreateHttpTransportOptions,
): AtriumUnaryTransport {
  const base = opts.baseUrl.trim().replace(/\/$/, "");
  const fetchFn: AtriumFetch = opts.fetch ?? globalThis.fetch;
  const signer = opts.signer;
  const now = opts.nowMs ?? (() => Date.now());
  const nonce = opts.nonceFactory ?? randomAgentRequestNonce;

  async function signHeaders(p: {
    method: string;
    path: string;
    bodyText: string;
  }): Promise<Record<string, string>> {
    const signed = await signAgentRequest({
      method: p.method,
      path: p.path,
      bodyText: p.bodyText,
      signer,
      now,
      nonce,
    });
    return signed.headers;
  }

  async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetchFn(`${base}${path}`, init);
  }

  function paths(
    pathname: string,
    query: RequestQuery | undefined,
    signedQueryKeys: readonly string[] | undefined,
  ): { fetchPath: string; signedPath: string } {
    const sp = new URLSearchParams();
    if (query !== undefined) {
      for (const [k, v] of Object.entries(query)) sp.append(k, v);
    }
    const qs = sp.toString();
    const fetchPath = qs.length > 0 ? `${pathname}?${qs}` : pathname;
    const allow = signedQueryKeys ?? (query !== undefined ? Object.keys(query) : []);
    const signedPath = canonicalAgentRequestPath(pathname, sp, allow);
    return { fetchPath, signedPath };
  }

  async function requestJson<T>(
    method: string,
    path: string,
    callOpts: RequestJsonOptions<T>,
  ): Promise<T> {
    const { fetchPath, signedPath } = paths(path, callOpts.query, callOpts.signedQueryKeys);
    let bodyText = "";
    const baseHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(callOpts.headers ?? {}),
    };
    if (callOpts.body !== undefined) {
      baseHeaders["Content-Type"] = "application/json";
      bodyText = JSON.stringify(callOpts.body);
    }
    const authHeaders = await signHeaders({ method, path: signedPath, bodyText });
    const headers: HeadersInit = { ...baseHeaders, ...authHeaders };
    const res = await rawFetch(fetchPath, {
      method,
      headers,
      body: bodyText.length > 0 ? bodyText : undefined,
    });
    if (!res.ok) {
      throw new AtriumClientError(await readErrorMessage(res), res.status);
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new AtriumClientError("Invalid JSON response", res.status, text);
    }
    const parsed = callOpts.parse.safeParse(json);
    if (!parsed.success) {
      throw new AtriumClientError(
        `Response shape mismatch: ${parsed.error.message}`,
        res.status,
        text,
      );
    }
    return parsed.data;
  }

  async function requestVoid(
    method: string,
    path: string,
    callOpts: RequestVoidOptions = {},
  ): Promise<void> {
    const { fetchPath, signedPath } = paths(path, callOpts.query, callOpts.signedQueryKeys);
    let bodyText = "";
    const baseHeaders: Record<string, string> = { Accept: "application/json" };
    if (callOpts.body !== undefined) {
      baseHeaders["Content-Type"] = "application/json";
      bodyText = JSON.stringify(callOpts.body);
    }
    const authHeaders = await signHeaders({ method, path: signedPath, bodyText });
    const res = await rawFetch(fetchPath, {
      method,
      headers: { ...baseHeaders, ...authHeaders },
      body: bodyText.length > 0 ? bodyText : undefined,
    });
    if (!res.ok) {
      throw new AtriumClientError(await readErrorMessage(res), res.status);
    }
  }

  return {
    base,
    get did() {
      return signer.did;
    },
    signer,
    now,
    nonce,
    fetch: rawFetch,
    requestJson,
    requestVoid,
  };
}

export async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: unknown };
    if (typeof j.error === "string" && j.error.length > 0) return j.error;
  } catch {
    /* ignore */
  }
  return text.length > 0 ? text : res.statusText;
}
