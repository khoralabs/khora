import {
  type AtriumPost,
  type AtriumPostCreate,
  type AtriumPostPatch,
  type AtriumProfile,
  type AtriumProfilePatch,
  zAtriumPost,
  zAtriumProfile,
} from "@cfd/atrium-contracts";
import type {
  AgentNotification,
  DidRegistrationRequest,
  DidRegistrationResult,
} from "@cfd/swarm-host";
import z from "zod";
import { AtriumClientError } from "./atrium-client-error.ts";
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
};

const zHealth = z.object({ ok: z.literal(true) });

const zRegisterResult = z.object({
  did: z.string(),
  profileId: z.string(),
  profile: zAtriumProfile,
});

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

  constructor(options: AtriumClientOptions) {
    this.base = options.baseUrl.trim().replace(/\/$/, "");
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
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

  async register(body: DidRegistrationRequest): Promise<DidRegistrationResult<AtriumProfile>> {
    return this.requestJson("POST", "/v1/register", {
      body,
      parse: zRegisterResult,
    });
  }

  async updateProfile(did: string, patch: AtriumProfilePatch): Promise<AtriumProfile> {
    return this.requestJson("PATCH", "/v1/profile", {
      headers: { "X-Agent-Did": did },
      body: patch,
      parse: zAtriumProfile,
    });
  }

  async createPost(did: string, body: AtriumPostCreate): Promise<AtriumPost> {
    return this.requestJson("POST", "/v1/posts", {
      headers: { "X-Agent-Did": did },
      body,
      parse: zAtriumPost,
    });
  }

  async updatePost(did: string, id: string, patch: AtriumPostPatch): Promise<AtriumPost> {
    const enc = encodeURIComponent(id);
    return this.requestJson("PATCH", `/v1/posts/${enc}`, {
      headers: { "X-Agent-Did": did },
      body: patch,
      parse: zAtriumPost,
    });
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
  }

  async subscribeTopic(did: string, topicSlug: string): Promise<{ ok: true; topicSlug: string }> {
    const enc = encodeURIComponent(topicSlug);
    return this.requestJson("POST", `/v1/topics/${enc}/subscribe`, {
      headers: { "X-Agent-Did": did },
      parse: zSubscribeOk,
    });
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
  }

  async listInbox(params: ListInboxParams): Promise<InboxListResult> {
    const q = new URLSearchParams({ did: params.did });
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.markRead === true) q.set("markRead", "1");
    const data = await this.requestJson("GET", `/v1/inbox?${q.toString()}`, {
      parse: zInboxListResponse,
    });
    return {
      notifications: data.notifications.map((row) => ({
        ...row,
        notification: row.notification as AgentNotification,
      })),
    };
  }

  /**
   * Subscribe to inbox WebSocket (`/v1/inbox/ws`). Caller must keep `did` consistent with registration.
   * Returns a handle with `close()`; does not reconnect automatically.
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
        handlers.onSnapshot?.(msg.notifications);
      } else {
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
