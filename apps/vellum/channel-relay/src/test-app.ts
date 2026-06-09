import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFrameRelayHub } from "@khoralabs/obp-frame-relay";

import { type ChannelRelayApp, createChannelRelayApp } from "./app";
import { createFrameStore, DEV_SQLCIPHER_KEY, envRelayMaxChannels, openRelayDatabase } from "./db";
import { createChannelRegistry } from "./registry";
import {
  bootstrapSingleChannel,
  type RelayProfile,
  type SingleChannelConfig,
} from "./relay-config";

export async function createTestChannelRelayApp(opts?: {
  relayProfile?: RelayProfile;
  singleBootstrap?: SingleChannelConfig;
  dbPath?: string;
}): Promise<{ app: ChannelRelayApp; db: Database; cleanup(): void }> {
  let cleanupDir: string | undefined;
  const dbPath =
    opts?.dbPath ??
    (() => {
      cleanupDir = mkdtempSync(join(tmpdir(), "vellum-relay-test-"));
      return join(cleanupDir, "relay.sqlite");
    })();

  const db = openRelayDatabase(dbPath, DEV_SQLCIPHER_KEY);
  const hub = createFrameRelayHub({ store: createFrameStore(db) });
  const registry = createChannelRegistry(db);

  let relayProfile: RelayProfile =
    opts?.relayProfile ??
    ({ mode: "pool", maxRelayChannels: envRelayMaxChannels() } satisfies RelayProfile);

  if (opts?.singleBootstrap !== undefined) {
    relayProfile = { mode: "single", config: opts.singleBootstrap };
  }

  if (relayProfile.mode === "single") {
    await bootstrapSingleChannel({ hub, registry, config: relayProfile.config });
  }

  const app = createChannelRelayApp({
    registry,
    hub,
    relayProfile,
  });

  return {
    app,
    db,
    cleanup() {
      db.close();
      if (cleanupDir !== undefined) {
        rmSync(cleanupDir, { recursive: true, force: true });
      }
    },
  };
}
