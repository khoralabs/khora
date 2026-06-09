import { Buffer } from "node:buffer";
import type { DuplexByteStream } from "@khoralabs/agent-io";
import { createWebSocketDuplexByteStream } from "@khoralabs/agent-io";
import { type ConnectInboxOptions, connectInbox, type InboxWsHandlers } from "./inbox-connect";

export type NegotiationDuplexArgs = {
  webSocketUrl: string;
  WebSocketCtor: typeof WebSocket;
  /** e.g. one-time upgrade nonce subprotocol for Vellum channel relay. */
  webSocketProtocols?: string | string[] | undefined;
};

/** Owns the underlying socket until {@link dispose}. */
export type NegotiationDuplexHandle = {
  channel: DuplexByteStream;
  dispose(): void;
};

export async function openWebSocketNegotiationDuplex(
  args: NegotiationDuplexArgs,
): Promise<NegotiationDuplexHandle> {
  const WS = args.WebSocketCtor;
  const ws =
    args.webSocketProtocols !== undefined
      ? new WS(args.webSocketUrl, args.webSocketProtocols)
      : new WS(args.webSocketUrl);
  ws.binaryType = "arraybuffer";

  await new Promise<void>((resolve, reject) => {
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onErr = (e: Event): void => {
      cleanup();
      reject(new Error(`WebSocket error: ${String((e as ErrorEvent).message ?? "error")}`));
    };
    const cleanup = (): void => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErr);
    };
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("error", onErr, { once: true });
  });

  const bridge = createWebSocketDuplexByteStream((bytes) => {
    ws.send(bytes);
  });

  const onMessage = (ev: MessageEvent): void => {
    const d = ev.data;
    if (d instanceof ArrayBuffer) {
      bridge.onMessage(d);
    } else if (d instanceof Uint8Array) {
      bridge.onMessage(d);
    } else if (Buffer.isBuffer(d)) {
      bridge.onMessage(new Uint8Array(d));
    } else if (typeof Blob !== "undefined" && d instanceof Blob) {
      void d.arrayBuffer().then((b) => bridge.onMessage(b));
    }
  };
  const onClose = (): void => {
    bridge.onClose();
  };
  ws.addEventListener("message", onMessage);
  ws.addEventListener("close", onClose);

  return {
    channel: bridge.channel,
    dispose(): void {
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}

export interface KhoraDuplexTransport {
  openNegotiationDuplex(args: NegotiationDuplexArgs): Promise<NegotiationDuplexHandle>;
  connectInbox(opts: ConnectInboxOptions, handlers: InboxWsHandlers): Promise<{ close(): void }>;
}

/** Default duplex binding: WebSocket for NBC negotiation + inbox subscription. */
export class WsKhoraDuplexTransport implements KhoraDuplexTransport {
  async openNegotiationDuplex(args: NegotiationDuplexArgs): Promise<NegotiationDuplexHandle> {
    return openWebSocketNegotiationDuplex(args);
  }

  connectInbox(opts: ConnectInboxOptions, handlers: InboxWsHandlers): Promise<{ close(): void }> {
    return connectInbox(opts, handlers);
  }
}
