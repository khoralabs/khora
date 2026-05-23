import type { OutboxPayloadCodec } from "@khoralabs/sqlite-crypto";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import type { AtriumDidAuth } from "@khoralabs/atrium-auth";
import type { AtriumInvitesRepo } from "@khoralabs/atrium-invites";
import type { AtriumRoomLifecycleHostEvent } from "@khoralabs/atrium-transport";
import type { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import type {
  RelayPrincipalLifecycle,
  SocialRelationshipPersistence,
} from "@khoralabs/relay-colonnade";
import type { AtriumHostCatalogApi } from "./catalog-facade.ts";
import type { AtriumMemoriesHost } from "./memories/bootstrap.ts";
import type {
  AtriumAdminStatsPort,
  AtriumColonnadeCluster,
  AtriumHostHealthPort,
} from "./ports.ts";

export type AtriumHostDeps = {
  persistence: AgentRelayPersistence;
  social: SocialRelationshipPersistence;
  tenantKey: string;
  cluster: AtriumColonnadeCluster;
  publicationClient: ColonnadePublicationClient;
  cellPoolCount: number;
  auth: AtriumDidAuth;
  principalLifecycle: RelayPrincipalLifecycle;
  invitesRepo?: AtriumInvitesRepo;
  memories?: AtriumMemoriesHost;
  health: AtriumHostHealthPort;
  adminStats: AtriumAdminStatsPort;
  catalog: AtriumHostCatalogApi;
  outboxPayloadCodec: OutboxPayloadCodec;
  startPrincipalTeardownWorker?: boolean;
  roomLifecycle?: (event: AtriumRoomLifecycleHostEvent) => void;
};
