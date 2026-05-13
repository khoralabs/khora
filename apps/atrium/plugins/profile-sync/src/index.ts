import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AtriumClient,
  AtriumClientEvent,
  AtriumPluginInstaller,
} from "@khoralabs/atrium-client";
import type { AtriumPost, AtriumProfile } from "@khoralabs/atrium-contracts";

export type ProfileSyncClient = Pick<AtriumClient, "subscribe" | "fetchAgentSync" | "did">;

export type ProfileSyncStateFileV1 = {
  version: 1;
  syncedAtMs: number;
  did: string;
  profile: AtriumProfile;
  topicSlugs: string[];
  authorTopics: { authorDid: string; topicSlug: string }[];
  probes: AtriumPost[];
};

function syncRelatedEvent(event: AtriumClientEvent, did: string): boolean {
  switch (event.type) {
    case "profile:updated":
      return event.did === did;
    case "topic:subscribed":
    case "topic:unsubscribed":
      return event.did === did;
    case "author_topic:subscribed":
    case "author_topic:unsubscribed":
      return event.did === did;
    case "post:created":
    case "post:updated":
      return event.did === did && event.post.kind === "probe";
    case "post:deleted":
      return event.did === did;
    default:
      return false;
  }
}

function atomicWriteJson(path: string, jsonText: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, jsonText, "utf8");
  renameSync(tmp, path);
}

export function createProfileSync(options: {
  client: ProfileSyncClient;
  filePath: string;
  pollIntervalMs?: number;
  debounceMs?: number;
}): {
  start(): void;
  stop(): void;
  flush(): Promise<void>;
} {
  const { client, filePath } = options;
  const did = client.did;
  const debounceMs = options.debounceMs ?? 750;
  let unsub: (() => void) | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const flush = async (): Promise<void> => {
    const snap = await client.fetchAgentSync();
    const state: ProfileSyncStateFileV1 = {
      version: 1,
      syncedAtMs: Date.now(),
      did,
      profile: snap.profile,
      topicSlugs: snap.topicSlugs,
      authorTopics: snap.authorTopics,
      probes: snap.probes,
    };
    atomicWriteJson(filePath, `${JSON.stringify(state, null, 2)}\n`);
  };

  const scheduleFlush = (): void => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    if (debounceMs <= 0) {
      void flush();
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void flush();
    }, debounceMs);
  };

  return {
    start() {
      void flush();
      unsub = client.subscribe((event) => {
        if (syncRelatedEvent(event, did)) scheduleFlush();
      });
      const pollMs = options.pollIntervalMs;
      if (pollMs !== undefined && pollMs > 0) {
        pollTimer = setInterval(() => void flush(), pollMs);
      }
    },
    stop() {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = undefined;
      if (pollTimer !== undefined) clearInterval(pollTimer);
      pollTimer = undefined;
      unsub?.();
      unsub = undefined;
    },
    flush,
  };
}

export type ProfileSyncPluginOptions = Omit<
  Parameters<typeof createProfileSync>[0],
  "client" | "filePath"
> & {
  filePath: string;
};

/** Curried installer: paths resolved via {@link AtriumPluginContext.resolvePath}. */
export function profileSyncPlugin(options: ProfileSyncPluginOptions): AtriumPluginInstaller {
  return (ctx) => {
    const sync = createProfileSync({
      ...options,
      client: ctx.client,
      filePath: ctx.resolvePath(options.filePath),
    });
    sync.start();
    return {
      stop() {
        sync.stop();
      },
    };
  };
}
