import type { OutboxPayloadCodec } from "@khoralabs/colonnade-crypto";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import type { HostPersistence } from "@khoralabs/host-runtime";
import type { KhoraDidAuth } from "@khoralabs/khora-auth";
import type { KhoraInvitesRepo } from "@khoralabs/khora-invites";
import type { RelayPrincipalLifecycle } from "@khoralabs/relay-colonnade";
import type { KhoraHostCatalogApi } from "./catalog-facade";
import type { KhoraMemoriesHost } from "./memories/bootstrap";
import type { KhoraPercolatorHost } from "./percolator/bootstrap";
import type {
  KhoraAdminStatsPort,
  KhoraColonnadeCluster,
  KhoraHostHealthPort,
  KhoraHostSpecPort,
} from "./ports";

export type KhoraHostDeps = {
  persistence: HostPersistence;
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
  hostSpec: KhoraHostSpecPort;
  catalog: KhoraHostCatalogApi;
  outboxPayloadCodec: OutboxPayloadCodec;
  startPrincipalTeardownWorker?: boolean;
};
