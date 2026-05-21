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
  RelayCatalogProjectionStore,
  RelayPrincipalLifecycle,
  SocialRelationshipPersistence,
} from "@khoralabs/relay-colonnade";
import type { AtriumHostCatalogApi } from "./catalog-facade.ts";
import type { AtriumInvitesRepo } from "./invites/atrium-invites.ts";

export type { AtriumHostCatalogApi } from "./catalog-facade.ts";

export type AtriumHostContext = {
  host: AgentRelay<AtriumProfile, AtriumPost, unknown, never>;
  auth: AtriumDidAuth;
  projectionStore: RelayCatalogProjectionStore;
  tenantKey: string;
  catalogDb: Database;
  framesDb: Database;
  roomHub: FrameChannelHubPort;
  cluster: SqliteColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  principalLifecycle: RelayPrincipalLifecycle;
  social: SocialRelationshipPersistence;
  roomLifecycle?: (event: AtriumRoomLifecycleHostEvent) => void;
  invitesRepo: AtriumInvitesRepo | undefined;
  principalTeardownWorker: PrincipalTeardownWorkerHandle;
} & AtriumHostCatalogApi;
