import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import type { KhoraDidAuth } from "@khoralabs/khora-auth";
import type { KhoraInvitesRepo } from "@khoralabs/khora-invites";
import type { KhoraRoomLifecycleHostEvent } from "@khoralabs/khora-transport";
import type {
  RelayPrincipalLifecycle,
  SocialRelationshipPersistence,
} from "@khoralabs/relay-colonnade";
import type { OutboxPayloadCodec } from "@khoralabs/sqlite-crypto";
import type { KhoraHostCatalogApi } from "./catalog-facade";
import type { KhoraMemoriesHost } from "./memories/bootstrap";
import type { KhoraPercolatorHost } from "./percolator/bootstrap";
import type { KhoraAdminStatsPort, KhoraColonnadeCluster, KhoraHostHealthPort } from "./ports";

export type KhoraHostDeps = {
  persistence: AgentRelayPersistence;
  social: SocialRelationshipPersistence;
  tenantKey: string;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  auth: KhoraDidAuth;
  principalLifecycle: RelayPrincipalLifecycle;
  invitesRepo?: KhoraInvitesRepo;
  memories?: KhoraMemoriesHost;
  percolator: KhoraPercolatorHost;
  health: KhoraHostHealthPort;
  adminStats: KhoraAdminStatsPort;
  catalog: KhoraHostCatalogApi;
  outboxPayloadCodec: OutboxPayloadCodec;
  startPrincipalTeardownWorker?: boolean;
  roomLifecycle?: (event: KhoraRoomLifecycleHostEvent) => void;
};
