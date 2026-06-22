import type { Database } from "bun:sqlite";

import {
  canReadPersonalKg,
  grantPersonalKgReader,
  hasSessionAccess,
  revokePersonalKgReader,
} from "../authz/policy";
import {
  clearPersonalMemoryConsentForParticipant,
  clearPersonalMemoryConsentForSession,
  countActivePersonalMemoryConsents,
  hasPersonalMemoryConsent,
  resolveOrgIdForSession,
  setPersonalMemoryConsent,
} from "../db/session-participants";

export function grantPersonalMemoryAccessForSession(
  db: Database,
  params: { orgId: string; sessionId: string; userId: string },
): void {
  grantPersonalKgReader(db, params.orgId, params.userId);
  setPersonalMemoryConsent(db, params.sessionId, params.userId);
}

export function canOrgAgentAccessParticipantPersonalMemories(
  db: Database,
  params: { orgId: string; sessionId: string; participantUserId: string },
): boolean {
  if (!hasSessionAccess(db, params.participantUserId, params.sessionId)) return false;
  if (!canReadPersonalKg(db, params.orgId, params.participantUserId)) return false;
  return hasPersonalMemoryConsent(db, params.sessionId, params.participantUserId);
}

function revokeOrgPersonalKgReaderIfUnused(db: Database, orgId: string, userId: string): void {
  if (countActivePersonalMemoryConsents(db, orgId, userId) === 0) {
    revokePersonalKgReader(db, orgId, userId);
  }
}

export function releasePersonalMemoryAccessForSession(db: Database, sessionId: string): void {
  const orgId = resolveOrgIdForSession(db, sessionId);
  if (orgId === null) return;

  const userIds = clearPersonalMemoryConsentForSession(db, sessionId);
  for (const userId of userIds) {
    revokeOrgPersonalKgReaderIfUnused(db, orgId, userId);
  }
}

export function releasePersonalMemoryAccessForParticipant(
  db: Database,
  sessionId: string,
  userId: string,
): void {
  const orgId = resolveOrgIdForSession(db, sessionId);
  if (orgId === null) return;
  if (!clearPersonalMemoryConsentForParticipant(db, sessionId, userId)) return;
  revokeOrgPersonalKgReaderIfUnused(db, orgId, userId);
}
