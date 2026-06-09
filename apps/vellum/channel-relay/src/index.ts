import { createFrameRelayHub } from "@khoralabs/obp-frame-relay";
import {
  bootstrapSingleChannel,
  createChannelRegistry,
  createChannelRelayApp,
  loadRelayProfile,
} from "@khoralabs/vellum-channel-host";

import { createFrameStore, openRelayDatabase } from "./db";

const DEFAULT_PORT = 8790;

function envPort(): number {
  const raw = process.env.PORT?.trim();
  if (raw === undefined || raw.length === 0) return DEFAULT_PORT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_PORT;
}

const relayProfile = loadRelayProfile();
const db = openRelayDatabase();
const hub = createFrameRelayHub({ store: createFrameStore(db) });
const registry = createChannelRegistry(db);

if (relayProfile.mode === "single") {
  await bootstrapSingleChannel({ hub, registry, config: relayProfile.config });
}

const app = createChannelRelayApp({
  registry,
  hub,
  relayProfile,
});

const server = Bun.serve({
  port: envPort(),
  fetch(req, srv) {
    return app.fetch(req, srv);
  },
  websocket: app.websocket,
});

const modeLabel =
  relayProfile.mode === "single" ? `single channel ${relayProfile.config.channelId}` : "pool";
console.log(`vellum channel-relay (${modeLabel}) listening on :${server.port}`);
