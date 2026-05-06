import type { FrameChannel } from "@cfd/obp-core";
import type { ClientHttp2Stream, ServerHttp2Stream } from "node:http2";
import type { Duplex } from "node:stream";

/** Duplex HTTP/2 stream → {@link FrameChannel} (one session per stream). */
export function frameChannelFromHttp2Stream(stream: ServerHttp2Stream): FrameChannel {
  return duplexStreamChannel(stream);
}

export function frameChannelFromClientStream(
  stream: ClientHttp2Stream,
  sessionClose: () => void,
): FrameChannel {
  const ch = duplexStreamChannel(stream);
  return {
    ...ch,
    async close(reason?: unknown) {
      await ch.close(reason);
      sessionClose();
    },
  };
}

function duplexStreamChannel(stream: Duplex): FrameChannel {
  return {
    async *read() {
      for await (const chunk of stream) {
        yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as Buffer);
      }
    },
    write(bytes: Uint8Array): Promise<void> {
      return new Promise((resolve, reject) => {
        stream.write(Buffer.from(bytes), (err: Error | null | undefined) =>
          err ? reject(err) : resolve(),
        );
      });
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        stream.end((err?: Error) => (err ? reject(err) : resolve()));
      });
    },
  };
}
