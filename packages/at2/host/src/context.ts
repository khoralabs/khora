import type { Database } from "bun:sqlite";
import type { AgentRelay } from "@khoralabs/agent-relay";
import type { FrameChannelHubPort } from "@khoralabs/agent-relay";
import type { AtriumDidAuth } from "@khoralabs/at2-auth";
import type { AtriumPost, AtriumProfile } from "@khoralabs/at2-contracts";
import type { RelayCatalogSourceMapStore, SocialRelationshipPersistence } from "@khoralabs/relay-colonnade";
import type { At2RoomLifecycleHostEvent } from "@khoralabs/at2-transport";
import type { At2InvitesRepo } from "./invites/at2-invites.ts";

export type At2HostContext = {
  host: AgentRelay<AtriumProfile, AtriumPost, unknown, never>;
  auth: AtriumDidAuth;
  store: RelayCatalogSourceMapStore;
  tenantKey: string;
  catalogDb: Database;
  roomHub: FrameChannelHubPort;
  /** Pairwise room/channel links (creator + peer DIDs) in Colonnade. */
  social: SocialRelationshipPersistence;
  /** Optional observer for room HTTP lifecycle (create, mint, join). */
  roomLifecycle?: (event: At2RoomLifecycleHostEvent) => void;
  /** Present when `AT2_INVITE_PEPPER` is set (or seeds / required invites need it). */
  invitesRepo: At2InvitesRepo | undefined;
};
