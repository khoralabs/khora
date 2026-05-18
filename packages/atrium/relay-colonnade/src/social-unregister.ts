import type { Database } from "bun:sqlite";
import type { AgentRelayPersistence, PrincipalId } from "@khoralabs/agent-relay";
import { purgeRelayCatalogPostEntity } from "./catalog-post-adapter.ts";
import {
  RELAY_CATALOG_REG_BY_PRINCIPAL,
  RELAY_CATALOG_REG_BY_PROFILE,
} from "./catalog-registration-adapter.ts";
import type { RelayCatalogSourceMapStore } from "./catalog-source-map-store.ts";
import { RELAY_CATALOG_SUBS_BY_SUBJECT } from "./catalog-subscription-adapter.ts";
import { insertPendingPrincipalTeardownJob } from "./principal-teardown-jobs.ts";
import { RELAY_CATALOG_SOURCE_PROFILE } from "./relay-colonnade-persistence.ts";
import {
  SOURCE_PRINCIPAL_TO_USERNAME,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./social-registration.ts";
import { purgeSocialRelationshipsForPrincipal } from "./social-relationship-persistence.ts";

const POST_KINDS = ["post", "probe", "status"] as const;

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

/** Username global index + tenant registration + profile source rows (within caller transaction). */
export function deletePrincipalUsernameIndexAndRegistrationRows(p: {
  store: RelayCatalogSourceMapStore;
  tenantKey: string;
  principalId: PrincipalId;
  profileId: string;
}): void {
  const { store, tenantKey, principalId, profileId } = p;
  const hit = store.lookupProjection(
    USERNAME_INDEX_TENANT_KEY,
    SOURCE_PRINCIPAL_TO_USERNAME,
    principalId,
  );
  const u = readUsernameFromPrincipalMapProjection(hit.projection);
  store.deleteRow(USERNAME_INDEX_TENANT_KEY, SOURCE_PRINCIPAL_TO_USERNAME, principalId);
  if (u !== undefined) {
    store.deleteRow(USERNAME_INDEX_TENANT_KEY, SOURCE_USERNAME_TO_PRINCIPAL, u);
  }
  store.deleteRow(tenantKey, RELAY_CATALOG_REG_BY_PRINCIPAL, principalId);
  store.deleteRow(tenantKey, RELAY_CATALOG_REG_BY_PROFILE, profileId);
  store.deleteRow(tenantKey, RELAY_CATALOG_SOURCE_PROFILE, profileId);
}

/**
 * Fast unregister: clear catalog registration + username index and enqueue durable teardown.
 * Does not delete posts, subscriptions, or social graph (worker completes teardown).
 */
export function phase1UnregisterColonnadePrincipal(p: {
  persistence: AgentRelayPersistence;
  store: RelayCatalogSourceMapStore;
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
      store: p.store,
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
 */
export function cascadeUnregisterColonnadePrincipalWithProfile(p: {
  persistence: AgentRelayPersistence;
  store: RelayCatalogSourceMapStore;
  catalogDb: Database;
  framesDb: Database;
  tenantKey: string;
  principalId: PrincipalId;
  profileId: string;
  relayInboxSourceMapId: string;
}): void {
  const seenPost = new Set<string>();
  for (const kind of POST_KINDS) {
    for (;;) {
      const rows = p.persistence.posts.listRowsByAuthorProfileIdAndKind({
        authorProfileId: p.profileId,
        kind,
        limit: 256,
      });
      if (rows.length === 0) break;
      let progressed = false;
      for (const r of rows) {
        if (seenPost.has(r.id)) continue;
        seenPost.add(r.id);
        progressed = true;
        purgeRelayCatalogPostEntity(p.store, p.catalogDb, p.tenantKey, r.id, {
          sourceMapId: p.relayInboxSourceMapId,
        });
      }
      if (!progressed) break;
    }
  }

  const ownInbox = p.store.listBySourceMap(
    p.tenantKey,
    p.relayInboxSourceMapId,
    `${p.principalId}/`,
  );
  p.catalogDb.transaction(() => {
    for (const r of ownInbox) {
      p.store.deleteRow(p.tenantKey, p.relayInboxSourceMapId, r.entry_key);
    }
  })();

  const authorSub = `author:${p.principalId}`;
  const followers = [
    ...p.persistence.agentSubjectSubscriptions.subscriberPrincipalsForSubject(authorSub),
  ];
  for (const peer of followers) {
    p.persistence.agentSubjectSubscriptions.unsubscribe(peer, authorSub);
  }

  const tupleSubjects = p.store.listBySourceMap(
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
    store: p.store,
    catalogDb: p.catalogDb,
    framesDb: p.framesDb,
    tenantKey: p.tenantKey,
    principalId: p.principalId,
  });

  p.catalogDb.transaction(() => {
    deletePrincipalUsernameIndexAndRegistrationRows({
      store: p.store,
      tenantKey: p.tenantKey,
      principalId: p.principalId,
      profileId: p.profileId,
    });
  })();

  deleteInviteTokensForDid(p.catalogDb, p.principalId);
}

/**
 * Eager teardown for a relay principal: posts (+ cross-principal inbox pointers to those posts),
 * own inbox prefix, subscriptions, social rooms, username maps, registration, profile, invites.
 */
export function cascadeUnregisterColonnadePrincipal(p: {
  persistence: AgentRelayPersistence;
  store: RelayCatalogSourceMapStore;
  catalogDb: Database;
  framesDb: Database;
  tenantKey: string;
  principalId: PrincipalId;
  relayInboxSourceMapId: string;
}): boolean {
  const profileId = p.persistence.agentRegistrations.profileIdForPrincipal(p.principalId);
  if (profileId === undefined) {
    return false;
  }
  cascadeUnregisterColonnadePrincipalWithProfile({ ...p, profileId });
  return true;
}
