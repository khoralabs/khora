import type {
  AgentSigner,
  AtriumPluginInstaller,
  LabeledAtriumPluginInstaller,
} from "@cfd/atrium-client";
import { AtriumClient } from "@cfd/atrium-client";
import { atriumLabeledPluginsFromProcessEnv } from "./plugins-env.ts";
import { resolveAtriumDaemonPlugins } from "./resolve-atrium-plugins.ts";

export type RunInboxDaemonOptions = {
  baseUrl: string;
  signer: AgentSigner;
  /** Log snapshot and live frames as JSON lines (default: human-readable stdout). */
  json?: boolean;
  /** Overrides `ATRIUM_DATA_DIR` when set. */
  dataDir?: string;
  /**
   * Additional labeled plugin layers merged after env (ignored when {@link plugins} is set).
   * Use {@link pluginCollision} to choose first-wins vs last-wins for duplicate ids.
   */
  extraPluginLayers?: readonly (readonly LabeledAtriumPluginInstaller[])[];
  /** How to resolve duplicate plugin ids across env and {@link extraPluginLayers} (default: last-wins). */
  pluginCollision?: "first-wins" | "last-wins";
  /** When set, replaces merged env + extras entirely. */
  plugins?: readonly AtriumPluginInstaller[];
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
  let resolved: { dataDir: string | undefined; plugins: AtriumPluginInstaller[] };
  try {
    resolved =
      opts.plugins !== undefined
        ? {
            dataDir: atriumLabeledPluginsFromProcessEnv().dataDir,
            plugins: [...opts.plugins],
          }
        : resolveAtriumDaemonPlugins({
            extraLayers: opts.extraPluginLayers,
            collision: opts.pluginCollision,
          });
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
  const client = new AtriumClient({
    baseUrl: opts.baseUrl,
    signer: opts.signer,
    dataDir: opts.dataDir ?? resolved.dataDir,
    plugins: resolved.plugins,
  });
  const json = opts.json === true;
  const did = opts.signer.did;

  let inboxClose: () => void = () => {};
  void client
    .connectInbox({
      onOpen() {
        logLine(json, "open", { did });
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
        console.error(
          json ? JSON.stringify({ t: "error", err: String(err) }) : `[error] ${String(err)}`,
        );
      },
    })
    .then((handle) => {
      inboxClose = handle.close;
    })
    .catch((err) => {
      console.error(
        json ? JSON.stringify({ t: "error", err: String(err) }) : `[error] ${String(err)}`,
      );
    });

  return {
    close() {
      inboxClose();
      client.dispose();
    },
  };
}
