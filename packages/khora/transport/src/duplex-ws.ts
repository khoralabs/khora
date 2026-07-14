import { Buffer } from "node:buffer";
import type { DuplexByteStream } from "@khoralabs/obp-byte-stream";
import { createWebSocketDuplexByteStream } from "@khoralabs/obp-byte-stream";
import { type ConnectInboxOptions, connectInbox, type InboxWsHandlers } from "./inbox-connect";

export type WebSocketByteDuplexArgs = {
  webSocketUrl: string;
  WebSocketCtor: typeof WebSocket;
  /** e.g. one-time upgrade nonce subprotocol for Vellum channel relay. */
  webSocketProtocols?: string | string[] | undefined;
};

/** Owns the underlying socket until {@link dispose}. */
export type WebSocketByteDuplexHandle = {
  channel: DuplexByteStream;
  dispose(): void;
};

/** Open a WebSocket and wrap it as a {@link DuplexByteStream}. */
export async function openWebSocketByteDuplex(
  args: WebSocketByteDuplexArgs,
): Promise<WebSocketByteDuplexHandle> {
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
    // DOM WebSocket.send expects ArrayBuffer-backed views; DuplexByteStream uses ArrayBufferLike.
    ws.send(bytes.slice());
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
  openByteDuplex(args: WebSocketByteDuplexArgs): Promise<WebSocketByteDuplexHandle>;
  connectInbox(opts: ConnectInboxOptions, handlers: InboxWsHandlers): Promise<{ close(): void }>;
}

/** Default duplex binding: WebSocket byte channel + inbox subscription. */
export class WsKhoraDuplexTransport implements KhoraDuplexTransport {
  async openByteDuplex(args: WebSocketByteDuplexArgs): Promise<WebSocketByteDuplexHandle> {
    return openWebSocketByteDuplex(args);
  }

  connectInbox(opts: ConnectInboxOptions, handlers: InboxWsHandlers): Promise<{ close(): void }> {
    return connectInbox(opts, handlers);
  }
}
