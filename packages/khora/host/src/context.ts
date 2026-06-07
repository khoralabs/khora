import type { AgentRelay } from "@khoralabs/agent-relay";
import type { OutboxPayloadCodec } from "@khoralabs/colonnade-crypto";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import type { KhoraDidAuth } from "@khoralabs/khora-auth";
import type { KhoraPost, KhoraProfile } from "@khoralabs/khora-contracts";
import type { KhoraInvitesRepo } from "@khoralabs/khora-invites";
import type { KhoraRoomLifecycleHostEvent } from "@khoralabs/khora-transport";
import type { FrameRelayHubPort, FrameRelayStoreStrategy } from "@khoralabs/obp-frame-relay";
import type {
  AgentAccountStatusPort,
  PrincipalTeardownWorkerHandle,
  RelayPrincipalLifecycle,
  SocialRelationshipPersistence,
} from "@khoralabs/relay-colonnade";
import type { KhoraHostCatalogApi } from "./catalog-facade";
import type { KhoraMemoriesHost } from "./memories/bootstrap";
import type { KhoraPercolatorHost } from "./percolator/bootstrap";
import type {
  KhoraAdminStatsPort,
  KhoraColonnadeCluster,
  KhoraHostHealthPort,
  KhoraHostSpecPort,
} from "./ports";

export type { KhoraHostCatalogApi } from "./catalog-facade";
export type { KhoraMemoriesHost } from "./memories/bootstrap";

export type KhoraHostContext = {
  host: AgentRelay<KhoraProfile, KhoraPost, unknown, never>;
  auth: KhoraDidAuth;
  tenantKey: string;
  roomHub: FrameRelayHubPort;
  frameRelayStore: FrameRelayStoreStrategy;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  principalLifecycle: RelayPrincipalLifecycle;
  social: SocialRelationshipPersistence;
  roomLifecycle?: (event: KhoraRoomLifecycleHostEvent) => void;
  invitesRepo: KhoraInvitesRepo | undefined;
  principalTeardownWorker: PrincipalTeardownWorkerHandle;
  memories?: KhoraMemoriesHost;
  percolator: KhoraPercolatorHost;
  health: KhoraHostHealthPort;
  adminStats: KhoraAdminStatsPort;
  agentAccountStatus: AgentAccountStatusPort;
  hostSpec: KhoraHostSpecPort;
  outboxPayloadCodec: OutboxPayloadCodec;
} & KhoraHostCatalogApi;
