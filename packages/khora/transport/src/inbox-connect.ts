import { inboxWebSocketUpgradeUrl, type RelaySigner, signInboxBind } from "@khoralabs/khora-auth";
import type { KhoraInboxNotification } from "@khoralabs/khora-contracts";
import type { KhoraClientEvent } from "./client-events";
import { type InboxNotificationRow, parseInboxWebSocketMessage } from "./inbox-ws";

export type InboxWsHandlers = {
  onHello?: (connectionId: string) => void;
  onBound?: (did: string) => void;
  onBindError?: (did: string | undefined, error: string) => void;
  onSnapshot?: (did: string, notifications: InboxNotificationRow[]) => void;
  onDrain?: (
    did: string,
    items: { entryKey: string; pointer: unknown; projection: unknown }[],
  ) => void;
  onNotification?: (msg: { did: string; id: number; notification: KhoraInboxNotification }) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: unknown) => void;
};

export type ConnectInboxOptions = {
  base: string;
  /** One or more principals to bind on this multiplex stream (N=1 is the common case). */
  signers: readonly RelaySigner[];
  now: () => number;
  nonce: () => string;
  WebSocketCtor: typeof WebSocket;
  emit: (event: KhoraClientEvent) => void;
};

/**
 * Subscribe to multiplex inbox WebSocket (`/v1/inbox/ws`):
 * open → `hello` → bind signed principals → `drain` / `notification` frames tagged with `did`.
 */
export async function connectInbox(
  opts: ConnectInboxOptions,
  handlers: InboxWsHandlers,
): Promise<{ close(): void }> {
  if (opts.signers.length === 0) {
    throw new Error("connectInbox: at least one signer required");
  }
  const urlString = inboxWebSocketUpgradeUrl(opts.base);
  let ws: WebSocket;
  try {
    ws = new opts.WebSocketCtor(urlString);
  } catch (e) {
    handlers.onError?.(e);
    return { close() {} };
  }

  let closed = false;
  let bindStarted = false;

  const runBind = async (connectionId: string) => {
    if (bindStarted || closed) return;
    bindStarted = true;
    handlers.onHello?.(connectionId);
    const principals = await Promise.all(
      opts.signers.map(async (signer) => {
        const envelope = await signInboxBind({
          connectionId,
          signer,
          now: opts.now,
          nonce: opts.nonce,
        });
        return {
          did: envelope.did,
          ts: envelope.timestampMs,
          nonce: envelope.nonce,
          sig: envelope.signatureB64Url,
        };
      }),
    );
    // Chunk binds to avoid huge frames (128 principals per frame).
    const CHUNK = 128;
    for (let i = 0; i < principals.length; i += CHUNK) {
      if (closed) return;
      ws.send(JSON.stringify({ type: "bind", principals: principals.slice(i, i + CHUNK) }));
    }
  };

  ws.addEventListener("open", () => {
    handlers.onOpen?.();
  });
  ws.addEventListener("close", () => {
    closed = true;
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
    if (msg.type === "hello") {
      void runBind(msg.connection_id).catch((e) => handlers.onError?.(e));
      return;
    }
    if (msg.type === "bound") {
      handlers.onBound?.(msg.did);
      return;
    }
    if (msg.type === "bind_error") {
      handlers.onBindError?.(msg.did, msg.error);
      handlers.onError?.(new Error(msg.error));
      return;
    }
    if (msg.type === "snapshot") {
      opts.emit({
        type: "inbox:snapshot",
        notifications: msg.notifications,
        did: msg.did,
      });
      handlers.onSnapshot?.(msg.did, msg.notifications);
      return;
    }
    if (msg.type === "drain") {
      opts.emit({ type: "inbox:drain", did: msg.did, items: msg.items });
      handlers.onDrain?.(msg.did, msg.items);
      return;
    }
    emitInboxNotification(opts.emit, msg.did, msg.id, msg.notification);
    handlers.onNotification?.({
      did: msg.did,
      id: msg.id,
      notification: msg.notification,
    });
  });
  return {
    close() {
      closed = true;
      ws.close();
    },
  };
}

function emitInboxNotification(
  emit: (event: KhoraClientEvent) => void,
  did: string,
  id: number,
  notification: KhoraInboxNotification,
): void {
  emit({ type: "inbox:notification", did, id, notification });
  switch (notification.kind) {
    case "connection_request":
      emit({ type: "inbox:connection_request", did, id, notification });
      break;
    case "host":
      emit({ type: "inbox:host", did, id, notification });
      break;
    case "inbox_post":
      emit({ type: "inbox:post", did, id, notification });
      break;
  }
}
