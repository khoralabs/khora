import { type AgentSigner, signedInboxUrl } from "@khoralabs/atrium-auth";
import type { AgentNotification } from "@khoralabs/swarm-host";
import type { AtriumClientEvent } from "../atrium-events.ts";
import { type InboxNotificationRow, parseInboxWebSocketMessage } from "../inbox-ws.ts";

export type InboxWsHandlers = {
  onSnapshot?: (notifications: InboxNotificationRow[]) => void;
  onNotification?: (msg: { id: number; notification: AgentNotification }) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: unknown) => void;
};

export type ConnectInboxOptions = {
  base: string;
  signer: AgentSigner;
  now: () => number;
  nonce: () => string;
  WebSocketCtor: typeof WebSocket;
  emit: (event: AtriumClientEvent) => void;
};

/**
 * Subscribe to inbox WebSocket (`/v1/inbox/ws`). The upgrade URL carries a one-time signed
 * envelope as search params (`did`, `ts`, `nonce`, `sig`). Returns a handle with `close()`;
 * does not reconnect automatically.
 *
 * Emits typed events via `opts.emit` before invoking `handlers` callbacks for each frame.
 */
export async function connectInbox(
  opts: ConnectInboxOptions,
  handlers: InboxWsHandlers,
): Promise<{ close(): void }> {
  const did = opts.signer.did;
  const urlString = await signedInboxUrl({
    baseUrl: opts.base,
    signer: opts.signer,
    now: opts.now,
    nonce: opts.nonce,
  });
  let ws: WebSocket;
  try {
    ws = new opts.WebSocketCtor(urlString);
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
      opts.emit({ type: "inbox:snapshot", notifications: msg.notifications, did });
      handlers.onSnapshot?.(msg.notifications);
    } else {
      emitInboxNotification(opts.emit, did, msg.id, msg.notification);
      handlers.onNotification?.({ id: msg.id, notification: msg.notification });
    }
  });
  return {
    close() {
      ws.close();
    },
  };
}

function emitInboxNotification(
  emit: (event: AtriumClientEvent) => void,
  did: string,
  id: number,
  notification: AgentNotification,
): void {
  emit({ type: "inbox:notification", did, id, notification });
  switch (notification.kind) {
    case "connection_request":
      emit({ type: "inbox:connection_request", did, id, notification });
      break;
    case "host":
      emit({ type: "inbox:host", did, id, notification });
      break;
    case "negotiation_ticket":
      emit({ type: "inbox:negotiation_ticket", did, id, notification });
      break;
    case "topic_post":
      emit({ type: "inbox:topic_post", did, id, notification });
      break;
    case "probe_hit":
      emit({ type: "inbox:probe_hit", did, id, notification });
      break;
  }
}
