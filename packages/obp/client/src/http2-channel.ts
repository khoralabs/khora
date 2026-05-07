import type { ClientHttp2Stream } from "node:http2";
import type { Duplex } from "node:stream";
import type { FrameChannel } from "@cfd/obp-core";

/** Client HTTP/2 request stream → {@link FrameChannel} (mirrors `@cfd/obp-server` binding). */
export function frameChannelFromClientStream(
  stream: ClientHttp2Stream,
  sessionClose?: () => void,
): FrameChannel {
  const ch = duplexStreamChannel(stream);
  return {
    ...ch,
    async close(reason?: unknown) {
      await ch.close(reason);
      sessionClose?.();
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
