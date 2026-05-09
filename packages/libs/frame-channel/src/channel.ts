/** Duplex byte stream abstraction (transport-agnostic). */
export interface FrameChannel {
  read(): AsyncIterable<Uint8Array>;
  write(bytes: Uint8Array): Promise<void>;
  close(reason?: unknown): Promise<void>;
}

type Side = { q: Uint8Array[]; w: Array<() => void> };

const wakeAll = (s: Side): void => {
  for (const f of s.w.splice(0)) {
    f();
  }
};

/** Pair of connected in-memory channels for tests. Calling `close()` on either ends both readers. */
export function createMemoryFrameChannelPair(): [FrameChannel, FrameChannel] {
  const a: Side = { q: [], w: [] };
  const b: Side = { q: [], w: [] };
  let done = false;

  const make = (incoming: Side, outgoing: Side): FrameChannel => ({
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
      outgoing.q.push(bytes);
      wakeAll(outgoing);
    },
    async close() {
      if (done) {
        return;
      }
      done = true;
      wakeAll(a);
      wakeAll(b);
    },
  });

  return [make(a, b), make(b, a)];
}
