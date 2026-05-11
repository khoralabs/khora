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
  zAtriumInviteListResponse,
  zAtriumInvitePreviewResponse,
  zAtriumPost,
  zAtriumProfile,
  zAtriumRegisterResult,
  zAtriumRegistrationRequestBody,
} from "@cfd/atrium-contracts";
import type { AgentNotification } from "@cfd/swarm-host";
import z from "zod";
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
  fetch?: AtriumFetch;
  WebSocket?: typeof WebSocket;
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
  did: string;
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
  private readonly eventListeners: Array<(event: AtriumClientEvent) => void> = [];
  private readonly pluginHandles: AtriumPluginHandle[] = [];

  constructor(options: AtriumClientOptions) {
    this.base = options.baseUrl.trim().replace(/\/$/, "");
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
    const resolvePath = createAtriumResolvePath(options.dataDir);
    for (const installer of options.plugins ?? []) {
      this.pluginHandles.push(installer({ client: this, resolvePath }));
    }
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

  private async requestJson<T>(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      headers?: Record<string, string>;
      parse: z.ZodType<T>;
    },
  ): Promise<T> {
    const headers: HeadersInit = {
      Accept: "application/json",
      ...(opts?.headers ?? {}),
    };
    let body: string | undefined;
    if (opts?.body !== undefined) {
      (headers as Record<string, string>)["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await this.fetchFn(`${this.base}${path}`, { method, headers, body });
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

  /** Snapshot of profile, topic subscriptions, and probe posts for `did` (requires registration). */
  async fetchAgentSync(did: string): Promise<AgentSyncSnapshot> {
    return this.requestJson("GET", "/v1/agent/sync", {
      headers: { "X-Agent-Did": did },
      parse: zAgentSyncSnapshot,
    });
  }

  async register(body: AtriumRegistrationRequestBody): Promise<AtriumRegistrationResult> {
    zAtriumRegistrationRequestBody.parse(body);
    const result = await this.requestJson("POST", "/v1/register", {
      body,
      parse: zAtriumRegisterResult,
    });
    this.emit({ type: "registration:completed", result, requestDid: body.did });
    return result;
  }

  async listInvites(did: string): Promise<AtriumInviteListResponse> {
    return this.requestJson("GET", "/v1/invites", {
      headers: { "X-Agent-Did": did },
      parse: zAtriumInviteListResponse,
    });
  }

  async previewInvite(token: string): Promise<AtriumInvitePreviewResponse> {
    return this.requestJson("POST", "/v1/invite/preview", {
      body: { token },
      parse: zAtriumInvitePreviewResponse,
    });
  }

  async updateProfile(did: string, patch: AtriumProfilePatch): Promise<AtriumProfile> {
    const profile = await this.requestJson("PATCH", "/v1/profile", {
      headers: { "X-Agent-Did": did },
      body: patch,
      parse: zAtriumProfile,
    });
    this.emit({ type: "profile:updated", profile, did });
    return profile;
  }

  async createPost(did: string, body: AtriumPostCreate): Promise<AtriumPost> {
    const post = await this.requestJson("POST", "/v1/posts", {
      headers: { "X-Agent-Did": did },
      body,
      parse: zAtriumPost,
    });
    this.emit({ type: "post:created", post, did });
    return post;
  }

  async updatePost(did: string, id: string, patch: AtriumPostPatch): Promise<AtriumPost> {
    const enc = encodeURIComponent(id);
    const post = await this.requestJson("PATCH", `/v1/posts/${enc}`, {
      headers: { "X-Agent-Did": did },
      body: patch,
      parse: zAtriumPost,
    });
    this.emit({ type: "post:updated", post, did });
    return post;
  }

  async deletePost(did: string, id: string): Promise<void> {
    const enc = encodeURIComponent(id);
    const res = await this.fetchFn(`${this.base}/v1/posts/${enc}`, {
      method: "DELETE",
      headers: { Accept: "application/json", "X-Agent-Did": did },
    });
    if (!res.ok) {
      throw new AtriumClientError(await readErrorMessage(res), res.status);
    }
    this.emit({ type: "post:deleted", postId: id, did });
  }

  async subscribeTopic(did: string, topicSlug: string): Promise<{ ok: true; topicSlug: string }> {
    const enc = encodeURIComponent(topicSlug);
    const out = await this.requestJson("POST", `/v1/topics/${enc}/subscribe`, {
      headers: { "X-Agent-Did": did },
      parse: zSubscribeOk,
    });
    this.emit({ type: "topic:subscribed", topicSlug: out.topicSlug, did });
    return out;
  }

  async unsubscribeTopic(did: string, topicSlug: string): Promise<void> {
    const enc = encodeURIComponent(topicSlug);
    const res = await this.fetchFn(`${this.base}/v1/topics/${enc}/subscribe`, {
      method: "DELETE",
      headers: { Accept: "application/json", "X-Agent-Did": did },
    });
    if (!res.ok) {
      throw new AtriumClientError(await readErrorMessage(res), res.status);
    }
    this.emit({ type: "topic:unsubscribed", topicSlug, did });
  }

  async listInbox(params: ListInboxParams): Promise<InboxListResult> {
    const q = new URLSearchParams({ did: params.did });
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.markRead === true) q.set("markRead", "1");
    const data = await this.requestJson("GET", `/v1/inbox?${q.toString()}`, {
      parse: zInboxListResponse,
    });
    const result: InboxListResult = {
      notifications: data.notifications.map((row) => ({
        ...row,
        notification: row.notification as AgentNotification,
      })),
    };
    this.emit({ type: "inbox:list", result, did: params.did });
    return result;
  }

  /**
   * Subscribe to inbox WebSocket (`/v1/inbox/ws`). Caller must keep `did` consistent with registration.
   * Returns a handle with `close()`; does not reconnect automatically.
   *
   * Typed `subscribe` events run before legacy `handlers` callbacks for each frame.
   */
  connectInbox(did: string, handlers: InboxWsHandlers): { close(): void } {
    const url = inboxWebSocketUrl(this.base, did);
    let ws: WebSocket;
    try {
      ws = new this.WebSocketCtor(url);
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
