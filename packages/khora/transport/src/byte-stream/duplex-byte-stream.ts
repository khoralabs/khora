import {
  DEFAULT_MAX_INBOUND_QUEUE_DEPTH,
  enqueueInbound,
  type InboundSide,
  wakeInboundWaiters,
} from "./bounded-inbound";

/** Duplex byte stream abstraction (transport-agnostic). */
export interface DuplexByteStream {
  read(): AsyncIterable<Uint8Array>;
  write(bytes: Uint8Array): Promise<void>;
  close(reason?: unknown): Promise<void>;
}

export type MemoryDuplexByteStreamOptions = {
  maxInboundQueueDepth?: number;
};

type Side = InboundSide;

/** Pair of connected in-memory streams for tests. Calling `close()` on either ends both readers. */
export function createMemoryDuplexByteStreamPair(
  options?: MemoryDuplexByteStreamOptions,
): [DuplexByteStream, DuplexByteStream] {
  const maxDepth = options?.maxInboundQueueDepth ?? DEFAULT_MAX_INBOUND_QUEUE_DEPTH;
  const a: Side = { q: [], w: [] };
  const b: Side = { q: [], w: [] };
  let done = false;

  const closeBoth = (): void => {
    if (done) {
      return;
    }
    done = true;
    wakeInboundWaiters(a);
    wakeInboundWaiters(b);
  };

  const make = (incoming: Side, outgoing: Side): DuplexByteStream => ({
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
      enqueueInbound(outgoing, bytes, maxDepth, closeBoth);
    },
    async close() {
      closeBoth();
    },
  });

  return [make(a, b), make(b, a)];
}
