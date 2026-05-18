import type { Database } from "bun:sqlite";
import type { AgentRelay, FrameChannelHubPort } from "@khoralabs/agent-relay";
import type { AtriumDidAuth } from "@khoralabs/at2-auth";
import type { AtriumPost, AtriumProfile } from "@khoralabs/at2-contracts";
import type { AtriumRoomLifecycleHostEvent } from "@khoralabs/at2-transport";
import type {
  RelayCatalogSourceMapStore,
  SocialRelationshipPersistence,
} from "@khoralabs/relay-colonnade";
import type { AtriumInvitesRepo } from "./invites/at2-invites.ts";

export type AtriumHostContext = {
  host: AgentRelay<AtriumProfile, AtriumPost, unknown, never>;
  auth: AtriumDidAuth;
  store: RelayCatalogSourceMapStore;
  tenantKey: string;
  catalogDb: Database;
  framesDb: Database;
  roomHub: FrameChannelHubPort;
  /** Pairwise room/channel links (creator + peer DIDs) in Colonnade. */
  social: SocialRelationshipPersistence;
  /** Optional observer for room HTTP lifecycle (create, mint, join). */
  roomLifecycle?: (event: AtriumRoomLifecycleHostEvent) => void;
  /** Present when `ATRIUM_INVITE_PEPPER` is set (or seeds / required invites need it). */
  invitesRepo: AtriumInvitesRepo | undefined;
};
