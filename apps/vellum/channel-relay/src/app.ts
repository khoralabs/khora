import type { FrameRelayHubPort, FrameRelayHubWsData } from "@khoralabs/obp-frame-relay";

import { type ChannelRelayAuth, createChannelRelayAuth } from "./auth";
import { envRelayMaxChannels } from "./db";
import type { ChannelRelayHttpDeps } from "./http/deps";
import { routeChannelRelayHttp } from "./http/router";
import { createPeerTrackedWebSocketHandlers } from "./peer-tracker";
import {
  type ChannelRelayRateLimiters,
  createChannelRelayRateLimiters,
} from "./rate-limit-buckets";
import type { ChannelRegistry } from "./registry";
import type { RelayProfile } from "./relay-config";

export { DEFAULT_CHANNEL_TTL_MS } from "./relay-config";

export type ChannelRelayApp = {
  hub: FrameRelayHubPort;
  auth: ChannelRelayAuth;
  registry: ChannelRegistry;
  websocket: ReturnType<typeof createPeerTrackedWebSocketHandlers>["handlers"];
  fetch(req: Request, server: Bun.Server<FrameRelayHubWsData>): Promise<Response | undefined>;
};

export type CreateChannelRelayAppOptions = {
  registry: ChannelRegistry;
  hub: FrameRelayHubPort;
  auth?: ChannelRelayAuth | undefined;
  rateLimiters?: ChannelRelayRateLimiters | undefined;
  relayProfile?: RelayProfile | undefined;
  now?: (() => number) | undefined;
};

export function createChannelRelayApp(opts: CreateChannelRelayAppOptions): ChannelRelayApp {
  const peerWs = createPeerTrackedWebSocketHandlers({ hub: opts.hub });
  const auth = opts.auth ?? createChannelRelayAuth({ now: opts.now });
  const rateLimiters = opts.rateLimiters ?? createChannelRelayRateLimiters();
  const now = opts.now ?? (() => Date.now());

  const relayProfile =
    opts.relayProfile ??
    ({ mode: "pool", maxRelayChannels: envRelayMaxChannels() } satisfies RelayProfile);

  const httpDeps: ChannelRelayHttpDeps = {
    hub: opts.hub,
    registry: opts.registry,
    auth,
    rateLimiters,
    relayProfile,
    now,
  };

  return {
    hub: opts.hub,
    auth,
    registry: opts.registry,
    websocket: peerWs.handlers,
    fetch(req, server) {
      return routeChannelRelayHttp(httpDeps, req, server);
    },
  };
}
