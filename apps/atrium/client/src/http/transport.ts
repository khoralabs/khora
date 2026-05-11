import { type AgentSigner, randomAgentRequestNonce, signAgentRequest } from "@cfd/atrium-auth";
import type z from "zod";
import { AtriumClientError } from "../atrium-client-error.ts";

/** Subset of `fetch` used by the client (avoids requiring Bun-specific properties on mocks). */
export type AtriumFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type HttpTransport = {
  readonly base: string;
  readonly did: string;
  readonly signer: AgentSigner;
  readonly now: () => number;
  readonly nonce: () => string;
  fetch(path: string, init?: RequestInit): Promise<Response>;
  requestJson<T>(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string>; parse: z.ZodType<T> },
  ): Promise<T>;
  requestVoid(method: string, path: string): Promise<void>;
};

export type CreateHttpTransportOptions = {
  baseUrl: string;
  signer: AgentSigner;
  fetch?: AtriumFetch;
  nowMs?: () => number;
  nonceFactory?: () => string;
};

export function createHttpTransport(opts: CreateHttpTransportOptions): HttpTransport {
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

  async function requestJson<T>(
    method: string,
    path: string,
    callOpts: { body?: unknown; headers?: Record<string, string>; parse: z.ZodType<T> },
  ): Promise<T> {
    let bodyText = "";
    const baseHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(callOpts.headers ?? {}),
    };
    if (callOpts.body !== undefined) {
      baseHeaders["Content-Type"] = "application/json";
      bodyText = JSON.stringify(callOpts.body);
    }
    const authHeaders = await signHeaders({ method, path, bodyText });
    const headers: HeadersInit = { ...baseHeaders, ...authHeaders };
    const res = await rawFetch(path, {
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

  async function requestVoid(method: string, path: string): Promise<void> {
    const authHeaders = await signHeaders({ method, path, bodyText: "" });
    const res = await rawFetch(path, {
      method,
      headers: { Accept: "application/json", ...authHeaders },
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
