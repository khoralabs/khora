import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence } from "@khoralabs/agent-relay";
import { normalizeUsername } from "@khoralabs/atrium-contracts";
import {
  phase1UnregisterColonnadePrincipal,
  registerAgentOnColonnadePersistence,
  relaySyntheticPointer,
  SOURCE_PRINCIPAL_TO_USERNAME,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
  type RelayCatalogSourceMapStore,
} from "@khoralabs/relay-colonnade";
import { RELAY_INBOX_SOURCE_MAP_ID } from "./relay-inbox.ts";
import { ATRIUM_ROOM_INVITE_SOURCE_MAP_ID } from "./room-invite.ts";
import { ATRIUM_ROOM_REGISTRY_SOURCE_MAP_ID } from "./room-registry.ts";

/** Catalog operations used by HTTP adapters; relay `source_map` keys stay inside the host. */
export type AtriumHostCatalogApi = {
  lookupPrincipalIdByNormalizedUsername(normalized: string): string | undefined;
  lookupNormalizedUsernameForPrincipal(principalId: string): string | undefined;
  rollbackUsernameMapsAfterFailedRegistration(
    principalId: string,
    priorNormalizedUsername: string | undefined,
  ): void;
  applyProfileUsernameAndMaps(input: {
    principalId: string;
    username: string;
    profileUpsert: { id: string; bodyJson: string };
  }): void;
  phase1UnregisterPrincipal(principalId: string): void;
  upsertRoomRegistryRow(
    roomId: string,
    projection: { creatorDid: string; inviteTargetDid: string | null; expiresAtMs: number },
  ): void;
  upsertRelayInboxRoomTicketRow(entryKey: string, roomId: string, projection: unknown): void;
  upsertRoomInviteRow(inviteHashKey: string, projection: unknown): void;
  lookupRoomInviteRow(joinTokenHashKey: string): { found: boolean; projection: unknown };
  lookupRoomRegistryRow(roomId: string): { found: boolean; projection: unknown };
};

const RELAY_ROOM_TICKET_SOURCE_MAP_ID = "relay:room-ticket";

export function createAtriumCatalogApi(deps: {
  persistence: AgentRelayPersistence;
  store: RelayCatalogSourceMapStore;
  catalogDb: Database;
  tenantKey: string;
}): AtriumHostCatalogApi {
  const { persistence, store, catalogDb, tenantKey } = deps;

  function lookupPrincipalIdByNormalizedUsername(normalized: string): string | undefined {
    const hit = store.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      SOURCE_USERNAME_TO_PRINCIPAL,
      normalized,
    );
    if (!hit.found || hit.projection === null || typeof hit.projection !== "object") {
      return undefined;
    }
    const pid = (hit.projection as Record<string, unknown>).principalId;
    return typeof pid === "string" ? pid : undefined;
  }

  function lookupNormalizedUsernameForPrincipal(principalId: string): string | undefined {
    const hit = store.lookupProjection(
      USERNAME_INDEX_TENANT_KEY,
      SOURCE_PRINCIPAL_TO_USERNAME,
      principalId,
    );
    if (!hit.found || hit.projection === null || typeof hit.projection !== "object") {
      return undefined;
    }
    const u = (hit.projection as Record<string, unknown>).username;
    return typeof u === "string" ? u : undefined;
  }

  function rollbackUsernameMapsAfterFailedRegistration(
    principalId: string,
    priorNormalizedUsername: string | undefined,
  ): void {
    const current = lookupNormalizedUsernameForPrincipal(principalId);
    if (current === undefined) return;
    store.deleteRow(USERNAME_INDEX_TENANT_KEY, SOURCE_PRINCIPAL_TO_USERNAME, principalId);
    store.deleteRow(USERNAME_INDEX_TENANT_KEY, SOURCE_USERNAME_TO_PRINCIPAL, current);
    if (priorNormalizedUsername === undefined) return;
    const username = normalizeUsername(priorNormalizedUsername);
    store.upsertRow({
      tenant_key: USERNAME_INDEX_TENANT_KEY,
      source_map_id: SOURCE_USERNAME_TO_PRINCIPAL,
      entry_key: username,
      pointer: relaySyntheticPointer(
        USERNAME_INDEX_TENANT_KEY,
        SOURCE_USERNAME_TO_PRINCIPAL,
        username,
      ),
      projection: { principalId },
    });
    store.upsertRow({
      tenant_key: USERNAME_INDEX_TENANT_KEY,
      source_map_id: SOURCE_PRINCIPAL_TO_USERNAME,
      entry_key: principalId,
      pointer: relaySyntheticPointer(
        USERNAME_INDEX_TENANT_KEY,
        SOURCE_PRINCIPAL_TO_USERNAME,
        principalId,
      ),
      projection: { username },
    });
  }

  return {
    lookupPrincipalIdByNormalizedUsername,
    lookupNormalizedUsernameForPrincipal,
    rollbackUsernameMapsAfterFailedRegistration,
    applyProfileUsernameAndMaps(input) {
      registerAgentOnColonnadePersistence(persistence, catalogDb, store, {
        principalId: input.principalId,
        username: input.username,
        profileUpsert: input.profileUpsert,
      });
    },
    phase1UnregisterPrincipal(principalId) {
      phase1UnregisterColonnadePrincipal({
        persistence,
        store,
        catalogDb,
        tenantKey,
        principalId,
      });
    },
    upsertRoomRegistryRow(roomId, projection) {
      store.upsertRow({
        tenant_key: tenantKey,
        source_map_id: ATRIUM_ROOM_REGISTRY_SOURCE_MAP_ID,
        entry_key: roomId,
        pointer: relaySyntheticPointer(tenantKey, ATRIUM_ROOM_REGISTRY_SOURCE_MAP_ID, roomId),
        projection,
      });
    },
    upsertRelayInboxRoomTicketRow(entryKey, roomId, projection) {
      store.upsertRow({
        tenant_key: tenantKey,
        source_map_id: RELAY_INBOX_SOURCE_MAP_ID,
        entry_key: entryKey,
        pointer: relaySyntheticPointer(tenantKey, RELAY_ROOM_TICKET_SOURCE_MAP_ID, roomId),
        projection,
      });
    },
    upsertRoomInviteRow(inviteHashKey, projection) {
      store.upsertRow({
        tenant_key: tenantKey,
        source_map_id: ATRIUM_ROOM_INVITE_SOURCE_MAP_ID,
        entry_key: inviteHashKey,
        pointer: relaySyntheticPointer(tenantKey, ATRIUM_ROOM_INVITE_SOURCE_MAP_ID, inviteHashKey),
        projection,
      });
    },
    lookupRoomInviteRow(joinTokenHashKey) {
      return store.lookupProjection(tenantKey, ATRIUM_ROOM_INVITE_SOURCE_MAP_ID, joinTokenHashKey);
    },
    lookupRoomRegistryRow(roomId) {
      return store.lookupProjection(tenantKey, ATRIUM_ROOM_REGISTRY_SOURCE_MAP_ID, roomId);
    },
  };
}
