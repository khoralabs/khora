import type { DuplexByteStream } from "./duplex-byte-stream.ts";

export type WebSocketDuplexByteSend = (bytes: Uint8Array) => void | Promise<void>;

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * Bridge Bun/WebSocket-style callbacks to {@link DuplexByteStream}.
 * Pass the same `send` your socket uses for outgoing binary frames.
 */
export function createWebSocketDuplexByteStream(send: WebSocketDuplexByteSend): {
  channel: DuplexByteStream;
  onMessage(data: Uint8Array | ArrayBuffer): void;
  onClose(): void;
} {
  type Side = { q: Uint8Array[]; w: Array<() => void> };
  const incoming: Side = { q: [], w: [] };
  let done = false;

  const wakeAll = (): void => {
    for (const f of incoming.w.splice(0)) {
      f();
    }
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
      if (done) {
        return;
      }
      done = true;
      wakeAll();
    },
  };

  return {
    channel,
    onMessage(data: Uint8Array | ArrayBuffer) {
      if (done) {
        return;
      }
      incoming.q.push(toUint8Array(data));
      wakeAll();
    },
    onClose() {
      if (done) {
        return;
      }
      done = true;
      wakeAll();
    },
  };
}
