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
  /** Principals to bind immediately after `hello` (may be empty if you only call {@link InboxConnectionHandle.bind} later). */
  signers: readonly RelaySigner[];
  now: () => number;
  nonce: () => string;
  WebSocketCtor: typeof WebSocket;
  emit: (event: KhoraClientEvent) => void;
};

const BIND_CHUNK = 128;

export type InboxConnectionHandle = {
  close(): void;
  /** Sign and send additional principal binds (after hello). */
  bind(signers: readonly RelaySigner[]): Promise<void>;
  /** Ask the host to drop live delivery for these DIDs. */
  unbind(dids: readonly string[]): Promise<void>;
};

/**
 * Subscribe to multiplex inbox WebSocket (`/v1/inbox/ws`):
 * open → `hello` → optional initial bind → `drain` / `notification` frames tagged with `did`.
 * Incremental {@link InboxConnectionHandle.bind} / {@link InboxConnectionHandle.unbind} after hello.
 */
export async function connectInbox(
  opts: ConnectInboxOptions,
  handlers: InboxWsHandlers,
): Promise<InboxConnectionHandle> {
  const urlString = inboxWebSocketUpgradeUrl(opts.base);
  let ws: WebSocket;
  try {
    ws = new opts.WebSocketCtor(urlString);
  } catch (e) {
    handlers.onError?.(e);
    return {
      close() {},
      async bind() {
        throw new Error("connectInbox: WebSocket failed to construct");
      },
      async unbind() {
        throw new Error("connectInbox: WebSocket failed to construct");
      },
    };
  }

  let closed = false;
  let connectionId: string | undefined;
  let resolveHello: (() => void) | undefined;
  const helloReady = new Promise<void>((resolve) => {
    resolveHello = resolve;
  });

  const waitHello = async (): Promise<string> => {
    if (closed) throw new Error("connectInbox: connection closed");
    if (connectionId !== undefined) return connectionId;
    await helloReady;
    if (closed || connectionId === undefined) {
      throw new Error("connectInbox: connection closed before hello");
    }
    return connectionId;
  };

  const sendBindPrincipals = async (signers: readonly RelaySigner[]): Promise<void> => {
    if (signers.length === 0) return;
    const connId = await waitHello();
    if (closed) return;
    const principals = await Promise.all(
      signers.map(async (signer) => {
        const envelope = await signInboxBind({
          connectionId: connId,
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
    for (let i = 0; i < principals.length; i += BIND_CHUNK) {
      if (closed) return;
      ws.send(JSON.stringify({ type: "bind", principals: principals.slice(i, i + BIND_CHUNK) }));
    }
  };

  const onHello = (id: string) => {
    if (connectionId !== undefined) return;
    connectionId = id;
    handlers.onHello?.(id);
    resolveHello?.();
    void sendBindPrincipals(opts.signers).catch((e) => handlers.onError?.(e));
  };

  ws.addEventListener("open", () => {
    handlers.onOpen?.();
  });
  ws.addEventListener("close", () => {
    closed = true;
    connectionId = undefined;
    resolveHello?.();
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
      onHello(msg.connection_id);
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
      resolveHello?.();
      ws.close();
    },
    bind(signers) {
      return sendBindPrincipals(signers);
    },
    async unbind(dids) {
      if (dids.length === 0) return;
      await waitHello();
      if (closed) return;
      ws.send(JSON.stringify({ type: "unbind", dids: [...dids] }));
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
