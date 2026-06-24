import type { Database } from "bun:sqlite";
import { publishAgentPersonalMemoryRead } from "../authz/facts";
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

export async function grantPersonalMemoryAccessForSession(
  db: Database,
  params: { orgId: string; sessionId: string; userId: string },
): Promise<void> {
  await grantPersonalKgReader(params.orgId, params.userId);
  await publishAgentPersonalMemoryRead(params.userId);
  setPersonalMemoryConsent(db, params.sessionId, params.userId);
}

export async function canOrgAgentAccessParticipantPersonalMemories(
  db: Database,
  params: { orgId: string; sessionId: string; participantUserId: string },
): Promise<boolean> {
  if (!(await hasSessionAccess(params.participantUserId, params.sessionId))) return false;
  if (!(await canReadPersonalKg(params.orgId, params.participantUserId))) return false;
  return hasPersonalMemoryConsent(db, params.sessionId, params.participantUserId);
}

async function revokeOrgPersonalKgReaderIfUnused(
  db: Database,
  orgId: string,
  userId: string,
): Promise<void> {
  if ((await countActivePersonalMemoryConsents(db, orgId, userId)) === 0) {
    await revokePersonalKgReader(orgId, userId);
  }
}

export async function releasePersonalMemoryAccessForSession(
  db: Database,
  sessionId: string,
): Promise<void> {
  const orgId = await resolveOrgIdForSession(db, sessionId);
  if (orgId === null) return;

  const userIds = clearPersonalMemoryConsentForSession(db, sessionId);
  for (const userId of userIds) {
    await revokeOrgPersonalKgReaderIfUnused(db, orgId, userId);
  }
}

export async function releasePersonalMemoryAccessForParticipant(
  db: Database,
  sessionId: string,
  userId: string,
): Promise<void> {
  const orgId = await resolveOrgIdForSession(db, sessionId);
  if (orgId === null) return;
  if (!clearPersonalMemoryConsentForParticipant(db, sessionId, userId)) return;
  await revokeOrgPersonalKgReaderIfUnused(db, orgId, userId);
}
