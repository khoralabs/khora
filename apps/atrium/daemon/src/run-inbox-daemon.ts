import { AtriumClient } from "@cfd/atrium-client";

export type RunInboxDaemonOptions = {
  baseUrl: string;
  did: string;
  /** Log snapshot and live frames as JSON lines (default: human-readable stdout). */
  json?: boolean;
};

function logLine(json: boolean, label: string, payload: unknown): void {
  if (json) {
    console.log(JSON.stringify({ t: label, payload }));
  } else {
    console.log(`[${label}] ${JSON.stringify(payload)}`);
  }
}

/**
 * Connect to Atrium `/v1/inbox/ws` and forward snapshot + notifications to stdout.
 * Does not reconnect on close; restart the process or wrap externally.
 */
export function runInboxDaemon(opts: RunInboxDaemonOptions): { close(): void } {
  const client = new AtriumClient({ baseUrl: opts.baseUrl });
  const json = opts.json === true;

  return client.connectInbox(opts.did, {
    onOpen() {
      logLine(json, "open", { did: opts.did });
    },
    onSnapshot(notifications) {
      logLine(json, "snapshot", { count: notifications.length, notifications });
    },
    onNotification(msg) {
      logLine(json, "notification", msg);
    },
    onClose() {
      logLine(json, "close", {});
      process.exit(0);
    },
    onError(err) {
      console.error(json ? JSON.stringify({ t: "error", err: String(err) }) : `[error] ${String(err)}`);
    },
  });
}
