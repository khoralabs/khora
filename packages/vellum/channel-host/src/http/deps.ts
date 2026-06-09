import type { FrameRelayHubPort } from "@khoralabs/obp-frame-relay";

import type { ChannelRelayAuth } from "../auth";
import type { ChannelRelayRateLimiters } from "../rate-limit-buckets";
import type { ChannelRegistry } from "../registry";
import type { RelayProfile } from "../relay-config";

export type ChannelRelayHttpDeps = {
  hub: FrameRelayHubPort;
  registry: ChannelRegistry;
  auth: ChannelRelayAuth;
  rateLimiters: ChannelRelayRateLimiters;
  relayProfile: RelayProfile;
  now: () => number;
};
