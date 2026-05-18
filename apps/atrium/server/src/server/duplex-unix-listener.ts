import { AuthError } from "@khoralabs/at2-auth";
import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import type { Socket } from "bun";
import type { HostRouteDeps } from "../http/deps.ts";
import { attachInboxDuplexAfterAuth, attachRoomDuplexAfterTicket } from "./duplex-attach.ts";
import { type DuplexUnixHandshake, parseDuplexUnixHandshakeJson } from "./duplex-unix-handshake.ts";

export type DuplexUnixIngressHandle = {
  /** @param closeActive forwarded to {@link Bun.listen} stop (default true). */
  stop(closeActive?: boolean): void;
};

type UnixDuplexBridge = {
  duplex: DuplexByteStream;
  pushInbound(data: Uint8Array | Buffer): void;
};

type DuplexUnixSocketState =
  | { tag: "collect"; chunks: Uint8Array[] }
  | {
      tag: "session";
      handshake: DuplexUnixHandshake;
      bridge: UnixDuplexBridge;
      dispose?: () => Promise<void>;
    };

export type DuplexUnixSocketData = {
  drainWaiters: Array<() => void>;
  state: DuplexUnixSocketState;
};

function toU8(data: Uint8Array | Buffer): Uint8Array {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return data;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.byteLength;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

async function socketWriteAll(
  socket: Socket<DuplexUnixSocketData>,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const slice = bytes.subarray(offset);
    const wrote = socket.write(slice);
    if (wrote === slice.byteLength) return;
    offset += wrote;
    await new Promise<void>((resolve) => {
      socket.data.drainWaiters.push(resolve);
    });
  }
}

function createUnixDuplexBridge(socket: Socket<DuplexUnixSocketData>): UnixDuplexBridge {
  const inbound: Uint8Array[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;

  const wake = (): void => {
    for (const r of waiters.splice(0)) r();
  };

  const pushInbound = (data: Uint8Array | Buffer): void => {
    if (closed) return;
    inbound.push(toU8(data));
    wake();
  };

  const duplex: DuplexByteStream = {
    async *read() {
      for (;;) {
        if (closed && inbound.length === 0) return;
        const next = inbound.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (closed) return;
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      }
    },
    async write(bytes: Uint8Array) {
      if (closed) return;
      try {
        await socketWriteAll(socket, bytes);
      } catch (err) {
        console.error("[atrium-server] duplex unix socket write failed", err);
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      wake();
      try {
        socket.end();
      } catch {
        /* ignore */
      }
    },
  };

  return { duplex, pushInbound };
}

function writeRejectLine(
  socket: Socket<DuplexUnixSocketData>,
  message: string,
  status: number,
): void {
  try {
    socket.write(`${JSON.stringify({ error: message, status })}\n`);
  } catch {
    /* ignore */
  }
  socket.end();
}

function rejectDuplexUnixSession(socket: Socket<DuplexUnixSocketData>, err: unknown): void {
  if (err instanceof AuthError) {
    writeRejectLine(socket, err.message, err.status);
    return;
  }
  writeRejectLine(socket, err instanceof Error ? err.message : String(err), 500);
}

async function settleDuplexUnixSession(
  socket: Socket<DuplexUnixSocketData>,
  deps: HostRouteDeps,
): Promise<void> {
  const st = socket.data.state;
  if (st.tag !== "session") return;
  const { handshake, bridge } = st;

  if (handshake.kind === "room") {
    const { dispose } = await attachRoomDuplexAfterTicket({
      ctx: deps.ctx,
      roomId: handshake.roomId,
      ticket: handshake.ticket,
      duplex: bridge.duplex,
    });
    st.dispose = dispose;
    return;
  }
  const { dispose } = await attachInboxDuplexAfterAuth({
    deps,
    duplex: bridge.duplex,
    did: handshake.did,
    ts: handshake.ts,
    nonce: handshake.nonce,
    sig: handshake.sig,
  });
  st.dispose = dispose;
}

/** Unix stream ingress: one accepted connection = one session; handshake JSON line then opaque binary. */
export function startDuplexUnixIngress(opts: {
  deps: HostRouteDeps;
  unixPath: string;
}): DuplexUnixIngressHandle {
  const listener = Bun.listen<DuplexUnixSocketData>({
    unix: opts.unixPath,
    socket: {
      open(socket) {
        socket.data = {
          drainWaiters: [],
          state: { tag: "collect", chunks: [] },
        };
      },
      drain(socket) {
        for (const r of socket.data.drainWaiters.splice(0)) r();
      },
      data(socket, chunk) {
        const u = toU8(chunk);
        const state = socket.data.state;

        if (state.tag === "session") {
          state.bridge.pushInbound(u);
          return;
        }

        const chunks = [...state.chunks, u];
        const merged = concatChunks(chunks);
        const nl = merged.indexOf(10);
        if (nl === -1) {
          socket.data.state = { tag: "collect", chunks: [merged] };
          return;
        }

        const lineBytes = merged.subarray(0, nl);
        const remainder = merged.subarray(nl + 1);
        const line = new TextDecoder().decode(lineBytes).replace(/\r$/, "").trim();

        let handshake: DuplexUnixHandshake;
        try {
          handshake = parseDuplexUnixHandshakeJson(JSON.parse(line) as unknown);
        } catch {
          writeRejectLine(socket, "invalid handshake", 400);
          return;
        }

        const bridge = createUnixDuplexBridge(socket);
        if (remainder.byteLength > 0) {
          bridge.pushInbound(remainder);
        }

        const sessionState: DuplexUnixSocketState = {
          tag: "session",
          handshake,
          bridge,
        };
        socket.data.state = sessionState;

        void settleDuplexUnixSession(socket, opts.deps).catch((err) => {
          rejectDuplexUnixSession(socket, err);
        });
      },
      close(socket) {
        const st = socket.data?.state;
        if (st?.tag === "session") {
          if (st.dispose !== undefined) {
            void st.dispose().catch(() => {});
          } else {
            void st.bridge.duplex.close().catch(() => {});
          }
        }
      },
      error(_socket, err) {
        console.error("[atrium-server] duplex unix socket error", err);
      },
    },
  });

  console.warn(`[atrium-server] Duplex unix ingress listening on ${opts.unixPath}`);
  return {
    stop: (closeActive = true) => {
      listener.stop(closeActive);
    },
  };
}
