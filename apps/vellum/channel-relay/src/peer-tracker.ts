import { type FrameRelayHubPort, frameRelayHubWebSocketHandlers } from "@khoralabs/obp-frame-relay";

export function createPeerTrackedWebSocketHandlers(deps: { hub: FrameRelayHubPort }): {
  handlers: ReturnType<typeof frameRelayHubWebSocketHandlers>;
} {
  return {
    handlers: frameRelayHubWebSocketHandlers({ hub: deps.hub }),
  };
}
