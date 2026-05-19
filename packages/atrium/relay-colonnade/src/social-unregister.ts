import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence, PrincipalId } from "@khoralabs/agent-relay";
import type { RelayCatalogProjectionStore } from "./catalog-projection-store.ts";
import {
  RELAY_CATALOG_REG_BY_PRINCIPAL,
  RELAY_CATALOG_REG_BY_PROFILE,
} from "./catalog-registration-adapter.ts";
import { RELAY_CATALOG_SUBS_BY_SUBJECT } from "./catalog-subscription-adapter.ts";
import { insertPendingPrincipalTeardownJob } from "./principal-teardown-jobs.ts";
import {
  RELAY_NAMESPACE_ENTITY_PROFILE,
  RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
  RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./relay-id-conventions.ts";
import { purgeSocialRelationshipsForPrincipal } from "./social-relationship-persistence.ts";

function readUsernameFromPrincipalMapProjection(projection: unknown): string | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const u = (projection as Record<string, unknown>).username;
  return typeof u === "string" && u.length > 0 ? u : undefined;
}

function deleteInviteTokensForDid(catalogDb: Database, did: PrincipalId): void {
  try {
    catalogDb
      .prepare(`DELETE FROM at2_invite_tokens WHERE minted_by_did = ? OR consumed_by_did = ?`)
      .run(did, did);
  } catch {
    /* optional in minimal catalogs */
  }
}

/** Username global index + tenant registration + profile projection rows (within caller transaction). */
export function deletePrincipalUsernameIndexAndRegistrationRows(p: {
  projectionStore: RelayCatalogProjectionStore;
  tenantKey: string;
  principalId: PrincipalId;
  profileId: string;
}): void {
  const { projectionStore: store, tenantKey, principalId, profileId } = p;
  const hit = store.lookupProjection(
    USERNAME_INDEX_TENANT_KEY,
    RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME,
    principalId,
  );
  const u = readUsernameFromPrincipalMapProjection(hit.projection);
  store.deleteRow(USERNAME_INDEX_TENANT_KEY, RELAY_NAMESPACE_PRINCIPAL_TO_USERNAME, principalId);
  if (u !== undefined) {
    store.deleteRow(USERNAME_INDEX_TENANT_KEY, RELAY_NAMESPACE_USERNAME_TO_PRINCIPAL, u);
  }
  store.deleteRow(tenantKey, RELAY_CATALOG_REG_BY_PRINCIPAL, principalId);
  store.deleteRow(tenantKey, RELAY_CATALOG_REG_BY_PROFILE, profileId);
  store.deleteRow(tenantKey, RELAY_NAMESPACE_ENTITY_PROFILE, profileId);
}

/**
 * Fast unregister: clear catalog registration + username index and enqueue durable teardown.
 * Does not delete subscriptions or social graph (worker completes teardown).
 */
export function phase1UnregisterColonnadePrincipal(p: {
  persistence: AgentRelayPersistence;
  projectionStore: RelayCatalogProjectionStore;
  catalogDb: Database;
  tenantKey: string;
  principalId: PrincipalId;
}): boolean {
  const profileId = p.persistence.agentRegistrations.profileIdForPrincipal(p.principalId);
  if (profileId === undefined) {
    return false;
  }
  const nowMs = Date.now();
  p.catalogDb.transaction(() => {
    deletePrincipalUsernameIndexAndRegistrationRows({
      projectionStore: p.projectionStore,
      tenantKey: p.tenantKey,
      principalId: p.principalId,
      profileId,
    });
    insertPendingPrincipalTeardownJob(p.catalogDb, {
      did: p.principalId,
      profileId,
      nowMs,
    });
  })();
  deleteInviteTokensForDid(p.catalogDb, p.principalId);
  return true;
}

/**
 * Full Colonnade teardown when `profileId` is known (e.g. worker after phase1 removed registration).
 * Author outbox/inbox purged separately by teardown worker via purgePrincipal.
 */
export function cascadeUnregisterColonnadePrincipalWithProfile(p: {
  persistence: AgentRelayPersistence;
  projectionStore: RelayCatalogProjectionStore;
  catalogDb: Database;
  framesDb: Database;
  tenantKey: string;
  principalId: PrincipalId;
  profileId: string;
}): void {
  const authorSub = `author:${p.principalId}`;
  const followers = [
    ...p.persistence.agentSubjectSubscriptions.subscriberPrincipalsForSubject(authorSub),
  ];
  for (const peer of followers) {
    p.persistence.agentSubjectSubscriptions.unsubscribe(peer, authorSub);
  }

  const tupleSubjects = p.projectionStore.listByPrefix(
    p.tenantKey,
    RELAY_CATALOG_SUBS_BY_SUBJECT,
    `author_topic:${p.principalId}\t`,
  );
  for (const row of tupleSubjects) {
    const subject = row.entry_key;
    const peers = [
      ...p.persistence.agentSubjectSubscriptions.subscriberPrincipalsForSubject(subject),
    ];
    for (const peer of peers) {
      p.persistence.agentSubjectSubscriptions.unsubscribe(peer, subject);
    }
  }

  const mySubs = [
    ...p.persistence.agentSubjectSubscriptions.listSubjectsForPrincipal(p.principalId),
  ];
  for (const s of mySubs) {
    p.persistence.agentSubjectSubscriptions.unsubscribe(p.principalId, s);
  }

  purgeSocialRelationshipsForPrincipal({
    projectionStore: p.projectionStore,
    catalogDb: p.catalogDb,
    framesDb: p.framesDb,
    tenantKey: p.tenantKey,
    principalId: p.principalId,
  });

  p.catalogDb.transaction(() => {
    deletePrincipalUsernameIndexAndRegistrationRows({
      projectionStore: p.projectionStore,
      tenantKey: p.tenantKey,
      principalId: p.principalId,
      profileId: p.profileId,
    });
  })();

  deleteInviteTokensForDid(p.catalogDb, p.principalId);
}

/** Eager teardown for a relay principal. Cell inbox/outbox purged by the teardown worker. */
export function cascadeUnregisterColonnadePrincipal(p: {
  persistence: AgentRelayPersistence;
  projectionStore: RelayCatalogProjectionStore;
  catalogDb: Database;
  framesDb: Database;
  tenantKey: string;
  principalId: PrincipalId;
}): boolean {
  const profileId = p.persistence.agentRegistrations.profileIdForPrincipal(p.principalId);
  if (profileId === undefined) {
    return false;
  }
  cascadeUnregisterColonnadePrincipalWithProfile({ ...p, profileId });
  return true;
}
