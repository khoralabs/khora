import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AtriumClient, AtriumClientEvent, AtriumPluginInstaller } from "@cfd/atrium-client";

export type TelemetryClient = Pick<AtriumClient, "subscribe">;

/** UTC ISO timestamp safe for filenames (no `:`). */
export function compactIsoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/**
 * Append JSONL lines `{ ts, event }` (`ts` = ms since epoch). Rotates when the **next** line would
 * exceed `maxFileBytes` on the current file. New files are named `telemetry-{firstLineTs}.jsonl`.
 * If a single serialized line exceeds `maxFileBytes`, it still occupies its own file (no splitting).
 */
export function createTelemetryArchive(options: {
  client: TelemetryClient;
  dir: string;
  maxFileBytes: number;
}): { close(): void } {
  const { client, dir, maxFileBytes } = options;
  mkdirSync(dir, { recursive: true });

  let currentPath: string | null = null;
  let bytesInFile = 0;

  const appendLine = (line: string, ts: number) => {
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (currentPath !== null && bytesInFile > 0 && bytesInFile + lineBytes > maxFileBytes) {
      currentPath = null;
      bytesInFile = 0;
    }
    if (currentPath === null) {
      currentPath = join(dir, `telemetry-${compactIsoUtc(ts)}.jsonl`);
      bytesInFile = 0;
    }
    appendFileSync(currentPath, line, "utf8");
    bytesInFile += lineBytes;
  };

  const unsub = client.subscribe((event: AtriumClientEvent) => {
    const ts = Date.now();
    const line = `${JSON.stringify({ ts, event })}\n`;
    appendLine(line, ts);
  });

  return {
    close() {
      unsub();
      currentPath = null;
      bytesInFile = 0;
    },
  };
}

export type TelemetryPluginOptions = Omit<
  Parameters<typeof createTelemetryArchive>[0],
  "client" | "dir"
> & {
  dir: string;
};

export function telemetryPlugin(options: TelemetryPluginOptions): AtriumPluginInstaller {
  return (ctx) => {
    const archive = createTelemetryArchive({
      ...options,
      client: ctx.client,
      dir: ctx.resolvePath(options.dir),
    });
    return {
      stop() {
        archive.close();
      },
    };
  };
}
