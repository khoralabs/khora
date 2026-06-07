import type { NbcTurnBody } from "@khoralabs/obp-nbc";
import type { SessionInitNormalized } from "./frame-protocol-types";

/** Handle passed to session handlers and {@link FrameSessionHandlers.onSessionReady}. */
export type FrameSessionHandle = {
  readonly sessionId: string;
  readonly init: SessionInitNormalized;
  readonly remoteActor: string;
  get tipHash(): string;
  sendTurn(body: NbcTurnBody): Promise<void>;
  terminate(reason: string, code?: string): Promise<void>;
};

/** Per-chain handlers when multiplexing; falls back to {@link FrameSessionHandlers} on the same runner when absent. */
export type MultiplexChainHooks = {
  onIncomingOffer?: (body: NbcTurnBody, session: FrameSessionHandle) => Promise<NbcTurnBody | null>;
  onTerminate?: (
    reason: string,
    code: string | undefined,
    session: FrameSessionHandle,
  ) => Promise<void>;
};

export type FrameMultiplexOpenerApi = {
  init(init: SessionInitNormalized, hooks?: MultiplexChainHooks): Promise<FrameSessionHandle>;
  close(): void;
};

export type FrameSessionHandlers = {
  onSessionReady?: (session: FrameSessionHandle) => Promise<void>;
  onIncomingOffer?: (body: NbcTurnBody, session: FrameSessionHandle) => Promise<NbcTurnBody | null>;
  onTerminate?: (reason: string, code: string | undefined, sessionId?: string) => Promise<void>;
};
