import type { Database } from "bun:sqlite";
import type { AgentRelay, FrameChannelHubPort } from "@khoralabs/agent-relay";
import type { AtriumDidAuth } from "@khoralabs/atrium-auth";
import type { AtriumPost, AtriumProfile } from "@khoralabs/atrium-contracts";
import type { AtriumRoomLifecycleHostEvent } from "@khoralabs/atrium-transport";
import type {
  ColonnadePublicationClient,
  SqliteColonnadeCluster,
} from "@khoralabs/colonnade-persistence";
import type {
  PrincipalTeardownWorkerHandle,
  RelayCatalogSourceMapStore,
  SocialRelationshipPersistence,
} from "@khoralabs/relay-colonnade";
import type { AtriumHostCatalogApi } from "./catalog-facade.ts";
import type { AtriumInvitesRepo } from "./invites/atrium-invites.ts";

export type { AtriumHostCatalogApi } from "./catalog-facade.ts";

export type AtriumHostContext = {
  host: AgentRelay<AtriumProfile, AtriumPost, unknown, never>;
  auth: AtriumDidAuth;
  store: RelayCatalogSourceMapStore;
  tenantKey: string;
  catalogDb: Database;
  framesDb: Database;
  roomHub: FrameChannelHubPort;
  cluster: SqliteColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  /** Pairwise room/channel links (creator + peer DIDs) in Colonnade. */
  social: SocialRelationshipPersistence;
  /** Optional observer for room HTTP lifecycle (create, mint, join). */
  roomLifecycle?: (event: AtriumRoomLifecycleHostEvent) => void;
  /** Present when `ATRIUM_INVITE_PEPPER` is set (or seeds / required invites need it). */
  invitesRepo: AtriumInvitesRepo | undefined;
  principalTeardownWorker: PrincipalTeardownWorkerHandle;
} & AtriumHostCatalogApi;
