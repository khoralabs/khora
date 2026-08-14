import type { ColonnadePublicationClient } from "@khoralabs/colonnade";
import type { OutboxPayloadCodec } from "@khoralabs/colonnade/crypto";
import type { KhoraDidAuth } from "@khoralabs/khora-auth";
import type { KhoraInvitesRepo } from "./invites";
import type { KhoraMemoriesHost } from "./memories/bootstrap";
import type { KhoraPercolatorHost } from "./percolator/bootstrap";
import type { KhoraHostPersistence } from "./persistence/types";
import type {
  KhoraAdminStatsPort,
  KhoraColonnadeCluster,
  KhoraHostHealthPort,
  KhoraHostSpecPort,
} from "./ports";
import type { KhoraRegistrationApi } from "./registration-api";
import type { PrincipalLifecycle } from "./runtime";

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
  registration: KhoraRegistrationApi;
  outboxPayloadCodec: OutboxPayloadCodec;
  startPrincipalTeardownWorker?: boolean;
};
