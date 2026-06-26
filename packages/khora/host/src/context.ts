import type { OutboxPayloadCodec } from "@khoralabs/colonnade-crypto";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import type {
  AgentAccountStatusPort,
  HostRuntime,
  PrincipalLifecycle,
  PrincipalTeardownWorkerHandle,
  SocialRelationshipPersistence,
} from "@khoralabs/host-runtime";
import type { KhoraDidAuth } from "@khoralabs/khora-auth";
import type { KhoraHostAppEvent, KhoraProfile } from "@khoralabs/khora-contracts";
import type { KhoraInvitesRepo } from "@khoralabs/khora-invites";
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
  host: HostRuntime<KhoraProfile, KhoraHostAppEvent>;
  auth: KhoraDidAuth;
  tenantKey: string;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  principalLifecycle: PrincipalLifecycle;
  social: SocialRelationshipPersistence;
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
