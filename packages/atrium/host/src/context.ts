import type { AgentRelay, FrameChannelHubPort } from "@khoralabs/agent-relay";
import type { AtriumDidAuth } from "@khoralabs/atrium-auth";
import type { AtriumPost, AtriumProfile } from "@khoralabs/atrium-contracts";
import type { AtriumInvitesRepo } from "@khoralabs/atrium-invites";
import type { AtriumRoomLifecycleHostEvent } from "@khoralabs/atrium-transport";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import type {
  PrincipalTeardownWorkerHandle,
  RelayPrincipalLifecycle,
  SocialRelationshipPersistence,
} from "@khoralabs/relay-colonnade";
import type { OutboxPayloadCodec } from "@khoralabs/sqlite-crypto";
import type { AtriumHostCatalogApi } from "./catalog-facade.ts";
import type { AtriumMemoriesHost } from "./memories/bootstrap.ts";
import type { AtriumPercolatorHost } from "./percolator/bootstrap.ts";
import type {
  AtriumAdminStatsPort,
  AtriumColonnadeCluster,
  AtriumHostHealthPort,
} from "./ports.ts";

export type { AtriumHostCatalogApi } from "./catalog-facade.ts";
export type { AtriumMemoriesHost } from "./memories/bootstrap.ts";

export type AtriumHostContext = {
  host: AgentRelay<AtriumProfile, AtriumPost, unknown, never>;
  auth: AtriumDidAuth;
  tenantKey: string;
  roomHub: FrameChannelHubPort;
  cluster: AtriumColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  principalLifecycle: RelayPrincipalLifecycle;
  social: SocialRelationshipPersistence;
  roomLifecycle?: (event: AtriumRoomLifecycleHostEvent) => void;
  invitesRepo: AtriumInvitesRepo | undefined;
  principalTeardownWorker: PrincipalTeardownWorkerHandle;
  memories?: AtriumMemoriesHost;
  percolator: AtriumPercolatorHost;
  health: AtriumHostHealthPort;
  adminStats: AtriumAdminStatsPort;
  outboxPayloadCodec: OutboxPayloadCodec;
} & AtriumHostCatalogApi;
