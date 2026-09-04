import {
  DEFAULT_MAX_INBOUND_QUEUE_DEPTH,
  type DuplexByteStream,
  enqueueInbound,
  type InboundSide,
  wakeInboundWaiters,
} from "@khoralabs/khora-contracts/byte-stream";

export type WebSocketDuplexByteSend = (bytes: Uint8Array) => void | Promise<void>;

export type WebSocketDuplexByteStreamOptions = {
  maxInboundQueueDepth?: number;
};

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * Bridge Bun/WebSocket-style callbacks to {@link DuplexByteStream}.
 * Pass the same `send` your socket uses for outgoing binary frames.
 */
export function createWebSocketDuplexByteStream(
  send: WebSocketDuplexByteSend,
  options?: WebSocketDuplexByteStreamOptions,
): {
  channel: DuplexByteStream;
  onMessage(data: Uint8Array | ArrayBuffer): void;
  onClose(): void;
} {
  const maxDepth = options?.maxInboundQueueDepth ?? DEFAULT_MAX_INBOUND_QUEUE_DEPTH;
  const incoming: InboundSide = { q: [], w: [] };
  let done = false;

  const closeStream = (): void => {
    if (done) {
      return;
    }
    done = true;
    wakeInboundWaiters(incoming);
  };

  const channel: DuplexByteStream = {
    async *read() {
      for (;;) {
        if (done && incoming.q.length === 0) {
          return;
        }
        const next = incoming.q.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (done) {
          return;
        }
        await new Promise<void>((resolve) => {
          incoming.w.push(resolve);
        });
      }
    },
    async write(bytes: Uint8Array) {
      if (done) {
        return;
      }
      await send(bytes);
    },
    async close() {
      closeStream();
    },
  };

  return {
    channel,
    onMessage(data: Uint8Array | ArrayBuffer) {
      if (done) {
        return;
      }
      enqueueInbound(incoming, toUint8Array(data), maxDepth, closeStream);
    },
    onClose() {
      closeStream();
    },
  };
}
