import {
  type AtriumInviteListResponse,
  type AtriumInvitePreviewResponse,
  type AtriumPost,
  type AtriumPostCreate,
  type AtriumPostPatch,
  type AtriumProfile,
  type AtriumProfilePatch,
  type AtriumRegistrationRequestBody,
  type AtriumRegistrationResult,
  zAgentStatusResponse,
  zAtriumInviteListResponse,
  zAtriumInvitePreviewResponse,
  zAtriumPost,
  zAtriumProfile,
  zAtriumRegisterResult,
  zAtriumRegistrationRequestBody,
} from "@cfd/atrium-contracts";
import {
  AGENT_REQUEST_HEADER,
  AGENT_REQUEST_SEARCH,
  type AgentNotification,
  canonicalAgentRequestMessage,
  randomAgentRequestNonce,
  signatureBytesToB64Url,
} from "@cfd/swarm-host";
import z from "zod";
import type { AgentSigner } from "./agent-signer.ts";
import { AtriumClientError } from "./atrium-client-error.ts";
import type { AtriumClientEvent } from "./atrium-events.ts";
import {
  type AtriumPluginHandle,
  type AtriumPluginInstaller,
  createAtriumResolvePath,
} from "./atrium-plugins.ts";
import {
  type InboxNotificationRow,
  inboxWebSocketUrl,
  parseInboxWebSocketMessage,
} from "./inbox-ws.ts";

/** Subset of `fetch` used by the client (avoids requiring Bun-specific properties on mocks). */
export type AtriumFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AtriumClientOptions = {
  baseUrl: string;
  /** Agent identity used to sign every request including `/v1/register`. */
  signer: AgentSigner;
  fetch?: AtriumFetch;
  WebSocket?: typeof WebSocket;
  /** Override clock (ms) for tests. */
  nowMs?: () => number;
  /** Override nonce generator for tests. */
  nonceFactory?: () => string;
  /** Optional root for plugin `resolvePath` (relative paths join here). */
  dataDir?: string;
  /** Plugins installed synchronously after construction; stopped by {@link AtriumClient.dispose}. */
  plugins?: readonly AtriumPluginInstaller[];
};

const zHealth = z.object({ ok: z.literal(true) });

const zInboxListResponse = z.object({
  notifications: z.array(
    z.object({
      id: z.number(),
      createdAtMs: z.number(),
      read: z.boolean(),
      notification: z.unknown(),
    }),
  ),
});

const zSubscribeOk = z.object({
  ok: z.literal(true),
  topicSlug: z.string(),
});

const zAgentSyncSnapshot = z.object({
  profile: zAtriumProfile,
  topicSlugs: z.array(z.string()),
  probes: z.array(zAtriumPost),
});

export type AgentSyncSnapshot = z.infer<typeof zAgentSyncSnapshot>;

export type AgentStatusSnapshot = z.infer<typeof zAgentStatusResponse>;

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: unknown };
    if (typeof j.error === "string" && j.error.length > 0) return j.error;
  } catch {
    /* ignore */
  }
  return text.length > 0 ? text : res.statusText;
}

export type ListInboxParams = {
  limit?: number;
  markRead?: boolean;
};

export type InboxListResult = {
  notifications: InboxNotificationRow[];
};

export type InboxWsHandlers = {
  onSnapshot?: (notifications: InboxNotificationRow[]) => void;
  onNotification?: (msg: { id: number; notification: AgentNotification }) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: unknown) => void;
};

export class AtriumClient {
  private readonly base: string;
  private readonly fetchFn: AtriumFetch;
  private readonly WebSocketCtor: typeof WebSocket;
  private readonly signer: AgentSigner;
  private readonly now: () => number;
  private readonly nonceFactory: () => string;
  private readonly eventListeners: Array<(event: AtriumClientEvent) => void> = [];
  private readonly pluginHandles: AtriumPluginHandle[] = [];

  constructor(options: AtriumClientOptions) {
    this.base = options.baseUrl.trim().replace(/\/$/, "");
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
    this.signer = options.signer;
    this.now = options.nowMs ?? (() => Date.now());
    this.nonceFactory = options.nonceFactory ?? randomAgentRequestNonce;
    const resolvePath = createAtriumResolvePath(options.dataDir);
    for (const installer of options.plugins ?? []) {
      this.pluginHandles.push(installer({ client: this, resolvePath }));
    }
  }

  /** DID resolved from the configured signer. */
  get did(): string {
    return this.signer.did;
  }

  /** Stop all plugins (reverse registration order); safe to call multiple times. */
  dispose(): void {
    for (let i = this.pluginHandles.length - 1; i >= 0; i--) {
      const h = this.pluginHandles[i];
      if (h !== undefined) h.stop();
    }
    this.pluginHandles.length = 0;
  }

  /**
   * Subscribe to successful RPC / inbox outcomes. Listeners run **synchronously** in registration
   * order; schedule async work yourself (e.g. `queueMicrotask`).
   */
  subscribe(listener: (event: AtriumClientEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const i = this.eventListeners.indexOf(listener);
      if (i >= 0) this.eventListeners.splice(i, 1);
    };
  }

  private emit(event: AtriumClientEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private emitInboxWsNotification(did: string, id: number, notification: AgentNotification): void {
    this.emit({ type: "inbox:notification", did, id, notification });
    switch (notification.kind) {
      case "connection_request":
        this.emit({ type: "inbox:connection_request", did, id, notification });
        break;
      case "host":
        this.emit({ type: "inbox:host", did, id, notification });
        break;
      case "negotiation_ticket":
        this.emit({ type: "inbox:negotiation_ticket", did, id, notification });
        break;
      case "topic_post":
        this.emit({ type: "inbox:topic_post", did, id, notification });
        break;
      case "probe_hit":
        this.emit({ type: "inbox:probe_hit", did, id, notification });
        break;
    }
  }

  /** Build the four `X-Agent-*` headers for `method path` and a body. */
  private async signRequest(p: {
    method: string;
    path: string;
    bodyText: string;
  }): Promise<Record<string, string>> {
    const timestampMs = this.now();
    const nonce = this.nonceFactory();
    const message = await canonicalAgentRequestMessage({
      method: p.method,
      path: p.path,
      timestampMs,
      nonce,
      bodyText: p.bodyText,
    });
    const sig = await this.signer.sign(message);
    return {
      [AGENT_REQUEST_HEADER.did]: this.signer.did,
      [AGENT_REQUEST_HEADER.ts]: String(timestampMs),
      [AGENT_REQUEST_HEADER.nonce]: nonce,
      [AGENT_REQUEST_HEADER.sig]: signatureBytesToB64Url(sig),
    };
  }

  private async requestJson<T>(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      headers?: Record<string, string>;
      parse: z.ZodType<T>;
    },
  ): Promise<T> {
    let bodyText = "";
    const baseHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(opts?.headers ?? {}),
    };
    if (opts?.body !== undefined) {
      baseHeaders["Content-Type"] = "application/json";
      bodyText = JSON.stringify(opts.body);
    }
    const authHeaders = await this.signRequest({ method, path, bodyText });
    const headers: HeadersInit = { ...baseHeaders, ...authHeaders };
    const res = await this.fetchFn(`${this.base}${path}`, {
      method,
      headers,
      body: bodyText.length > 0 ? bodyText : undefined,
    });
    if (!res.ok) {
      const msg = await readErrorMessage(res);
      throw new AtriumClientError(msg, res.status);
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new AtriumClientError("Invalid JSON response", res.status, text);
    }
    const parsed = opts.parse.safeParse(json);
    if (!parsed.success) {
      throw new AtriumClientError(
        `Response shape mismatch: ${parsed.error.message}`,
        res.status,
        text,
      );
    }
    return parsed.data;
  }

  async health(): Promise<{ ok: true }> {
    const res = await this.fetchFn(`${this.base}/health`, { method: "GET" });
    if (!res.ok) {
      throw new AtriumClientError(await readErrorMessage(res), res.status);
    }
    const json = (await res.json()) as unknown;
    return zHealth.parse(json);
  }

  /** Snapshot of profile, topic subscriptions, and probe posts (requires registration). */
  async fetchAgentSync(): Promise<AgentSyncSnapshot> {
    return this.requestJson("GET", "/v1/agent/sync", {
      parse: zAgentSyncSnapshot,
    });
  }

  /** Current `kind: "status"` post for the agent, if any (`GET /v1/agent/status`). */
  async getAgentStatus(): Promise<AtriumPost | null> {
    const out = await this.requestJson("GET", "/v1/agent/status", {
      parse: zAgentStatusResponse,
    });
    return out.status;
  }

  async register(
    body: Omit<AtriumRegistrationRequestBody, "did"> & { did?: string } = {},
  ): Promise<AtriumRegistrationResult> {
    const finalBody: AtriumRegistrationRequestBody = zAtriumRegistrationRequestBody.parse({
      ...body,
      did: this.signer.did,
    });
    const result = await this.requestJson("POST", "/v1/register", {
      body: finalBody,
      parse: zAtriumRegisterResult,
    });
    this.emit({ type: "registration:completed", result, requestDid: finalBody.did });
    return result;
  }

  async listInvites(): Promise<AtriumInviteListResponse> {
    return this.requestJson("GET", "/v1/invites", {
      parse: zAtriumInviteListResponse,
    });
  }

  async previewInvite(token: string): Promise<AtriumInvitePreviewResponse> {
    return this.requestJson("POST", "/v1/invite/preview", {
      body: { token },
      parse: zAtriumInvitePreviewResponse,
    });
  }

  async updateProfile(patch: AtriumProfilePatch): Promise<AtriumProfile> {
    const profile = await this.requestJson("PATCH", "/v1/profile", {
      body: patch,
      parse: zAtriumProfile,
    });
    this.emit({ type: "profile:updated", profile, did: this.signer.did });
    return profile;
  }

  async createPost(body: AtriumPostCreate): Promise<AtriumPost> {
    const post = await this.requestJson("POST", "/v1/posts", {
      body,
      parse: zAtriumPost,
    });
    this.emit({ type: "post:created", post, did: this.signer.did });
    return post;
  }

  async updatePost(id: string, patch: AtriumPostPatch): Promise<AtriumPost> {
    const enc = encodeURIComponent(id);
    const post = await this.requestJson("PATCH", `/v1/posts/${enc}`, {
      body: patch,
      parse: zAtriumPost,
    });
    this.emit({ type: "post:updated", post, did: this.signer.did });
    return post;
  }

  async deletePost(id: string): Promise<void> {
    const enc = encodeURIComponent(id);
    const path = `/v1/posts/${enc}`;
    const authHeaders = await this.signRequest({ method: "DELETE", path, bodyText: "" });
    const res = await this.fetchFn(`${this.base}${path}`, {
      method: "DELETE",
      headers: { Accept: "application/json", ...authHeaders },
    });
    if (!res.ok) {
      throw new AtriumClientError(await readErrorMessage(res), res.status);
    }
    this.emit({ type: "post:deleted", postId: id, did: this.signer.did });
  }

  async subscribeTopic(topicSlug: string): Promise<{ ok: true; topicSlug: string }> {
    const enc = encodeURIComponent(topicSlug);
    const out = await this.requestJson("POST", `/v1/topics/${enc}/subscribe`, {
      parse: zSubscribeOk,
    });
    this.emit({ type: "topic:subscribed", topicSlug: out.topicSlug, did: this.signer.did });
    return out;
  }

  async unsubscribeTopic(topicSlug: string): Promise<void> {
    const enc = encodeURIComponent(topicSlug);
    const path = `/v1/topics/${enc}/subscribe`;
    const authHeaders = await this.signRequest({ method: "DELETE", path, bodyText: "" });
    const res = await this.fetchFn(`${this.base}${path}`, {
      method: "DELETE",
      headers: { Accept: "application/json", ...authHeaders },
    });
    if (!res.ok) {
      throw new AtriumClientError(await readErrorMessage(res), res.status);
    }
    this.emit({ type: "topic:unsubscribed", topicSlug, did: this.signer.did });
  }

  async listInbox(params: ListInboxParams = {}): Promise<InboxListResult> {
    const q = new URLSearchParams();
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.markRead === true) q.set("markRead", "1");
    const qs = q.toString();
    const path = qs.length > 0 ? `/v1/inbox?${qs}` : "/v1/inbox";
    const data = await this.requestJson("GET", path, {
      parse: zInboxListResponse,
    });
    const result: InboxListResult = {
      notifications: data.notifications.map((row) => ({
        ...row,
        notification: row.notification as AgentNotification,
      })),
    };
    this.emit({ type: "inbox:list", result, did: this.signer.did });
    return result;
  }

  /**
   * Subscribe to inbox WebSocket (`/v1/inbox/ws`). The upgrade URL carries a one-time signed
   * envelope as search params (`did`, `ts`, `nonce`, `sig`). Returns a handle with `close()`;
   * does not reconnect automatically.
   *
   * Typed `subscribe` events run before legacy `handlers` callbacks for each frame.
   */
  async connectInbox(handlers: InboxWsHandlers): Promise<{ close(): void }> {
    const did = this.signer.did;
    const path = "/v1/inbox/ws";
    const timestampMs = this.now();
    const nonce = this.nonceFactory();
    const message = await canonicalAgentRequestMessage({
      method: "GET",
      path,
      timestampMs,
      nonce,
      bodyText: "",
    });
    const sig = signatureBytesToB64Url(await this.signer.sign(message));
    const baseUrl = inboxWebSocketUrl(this.base, did);
    const u = new URL(baseUrl);
    u.searchParams.set(AGENT_REQUEST_SEARCH.ts, String(timestampMs));
    u.searchParams.set(AGENT_REQUEST_SEARCH.nonce, nonce);
    u.searchParams.set(AGENT_REQUEST_SEARCH.sig, sig);
    let ws: WebSocket;
    try {
      ws = new this.WebSocketCtor(u.toString());
    } catch (e) {
      handlers.onError?.(e);
      return { close() {} };
    }
    ws.addEventListener("open", () => {
      handlers.onOpen?.();
    });
    ws.addEventListener("close", () => {
      handlers.onClose?.();
    });
    ws.addEventListener("error", (ev) => {
      handlers.onError?.(ev);
    });
    ws.addEventListener("message", (ev) => {
      const text =
        typeof ev.data === "string"
          ? ev.data
          : typeof Buffer !== "undefined" && Buffer.isBuffer(ev.data)
            ? ev.data.toString("utf8")
            : String(ev.data);
      const msg = parseInboxWebSocketMessage(text);
      if (msg === undefined) return;
      if (msg.type === "snapshot") {
        this.emit({ type: "inbox:snapshot", notifications: msg.notifications, did });
        handlers.onSnapshot?.(msg.notifications);
      } else {
        this.emitInboxWsNotification(did, msg.id, msg.notification);
        handlers.onNotification?.({ id: msg.id, notification: msg.notification });
      }
    });
    return {
      close() {
        ws.close();
      },
    };
  }
}
