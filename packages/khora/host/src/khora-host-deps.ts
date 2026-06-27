import type { OutboxPayloadCodec } from "@khoralabs/colonnade-crypto";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import type { PrincipalLifecycle } from "@khoralabs/host-runtime";
import type { KhoraDidAuth } from "@khoralabs/khora-auth";
import type { KhoraInvitesRepo } from "@khoralabs/khora-invites";
import type { KhoraHostCatalogApi } from "./catalog-facade";
import type { KhoraMemoriesHost } from "./memories/bootstrap";
import type { KhoraPercolatorHost } from "./percolator/bootstrap";
import type { KhoraHostPersistence } from "./persistence/types";
import type {
  KhoraAdminStatsPort,
  KhoraColonnadeCluster,
  KhoraHostHealthPort,
  KhoraHostSpecPort,
} from "./ports";

export type KhoraHostDeps = {
  persistence: KhoraHostPersistence;
  tenantKey: string;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  auth: KhoraDidAuth;
  principalLifecycle: PrincipalLifecycle;
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
