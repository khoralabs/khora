import type { ColonnadePublicationClient } from "@khoralabs/colonnade";
import type { OutboxPayloadCodec } from "@khoralabs/colonnade/crypto";
import type { SignedRequestAuth } from "@khoralabs/khora-auth";

import type { KhoraHostAppEvent, KhoraProfile } from "@khoralabs/khora-contracts";
import type { HostSearch } from "../discovery/search/bootstrap";
import type { HostSubscriptions } from "../discovery/subscriptions/bootstrap";
import type {
  AgentAccountStatusPort,
  KhoraInvitesRepo,
  SocialRelationshipPersistence,
} from "../persistence/core/port";
import type {
  KhoraAdminStatsPort,
  KhoraColonnadeCluster,
  KhoraHostHealthPort,
  KhoraHostSpecPort,
} from "../ports";
import type { KhoraRegistrationApi } from "../registration/api";
import type { PrincipalLifecycle } from "../registration/lifecycle";
import type { PrincipalTeardownWorkerHandle } from "../registration/teardown-worker";
import type { HostRuntime } from "./runtime";

export type { HostSearch } from "../discovery/search/bootstrap";
export type { KhoraRegistrationApi } from "../registration/api";

export type KhoraHostContext = {
  host: HostRuntime<KhoraProfile, KhoraHostAppEvent>;
  auth: SignedRequestAuth;
  tenantKey: string;
  cluster: KhoraColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  principalLifecycle: PrincipalLifecycle;
  social: SocialRelationshipPersistence;
  invitesRepo: KhoraInvitesRepo | undefined;
  principalTeardownWorker: PrincipalTeardownWorkerHandle;
  search?: HostSearch;
  subscriptions: HostSubscriptions;
  health: KhoraHostHealthPort;
  adminStats: KhoraAdminStatsPort;
  agentAccountStatus: AgentAccountStatusPort;
  hostSpec: KhoraHostSpecPort;
  outboxPayloadCodec: OutboxPayloadCodec;
} & KhoraRegistrationApi;
