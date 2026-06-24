import type { Database } from "bun:sqlite";
import { facilitationChatThreadId } from "@khoralabs/exedra-chat/thread-ids";
import { publishSessionBelongsToTeam } from "../authz/facts";
import {
  accountScope,
  Feature,
  hasSessionAccess,
  isSessionFacilitator,
  listAccountIdsForTeam,
  listGrantScopeIdsForResource,
  ResourceType,
  ScopeType,
  threadResource,
  userHasAnySessionParticipantGrant,
} from "../authz/policy";
import { requireAuthzServiceClient } from "../authz/service-client";
import { createOrgWithAdmin, createTeamWithGrants } from "./membership";

export { isTeamMember } from "./membership";

export type SessionKind = "standard" | "onboarding";
export type SessionLinkAccess = "restricted" | "anyone";

export type SessionLinkGrantRole = "participant" | "facilitation";

export type SessionRecord = {
  id: string;
  teamId: string;
  topic: string;
  deadlineMs: number | null;
  status: string;
  kind: SessionKind;
  createdAtMs: number;
  interviewSummary: string | null;
  nextSessionOptions: string[] | null;
  interviewCompletedAtMs: number | null;
};

type SessionRow = {
  id: string;
  team_id: string;
  topic: string;
  deadline_ms: number | null;
  status: string;
  kind: string;
  created_at_ms: number;
  interview_summary: string | null;
  next_session_options: string | null;
  interview_completed_at_ms: number | null;
};

function parseNextSessionOptions(raw: string | null): string[] | null {
  if (raw === null || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    topic: row.topic,
    deadlineMs: row.deadline_ms,
    status: row.status,
    kind: row.kind === "onboarding" ? "onboarding" : "standard",
    createdAtMs: row.created_at_ms,
    interviewSummary: row.interview_summary ?? null,
    nextSessionOptions: parseNextSessionOptions(row.next_session_options ?? null),
    interviewCompletedAtMs: row.interview_completed_at_ms ?? null,
  };
}

export function buildOnboardingSessionTopic(orgName: string, teamName: string): string {
  return `Getting to know ${orgName} and ${teamName}`;
}

export async function createOrg(
  db: Database,
  params: { name: string; ownerId: string },
): Promise<string> {
  return createOrgWithAdmin(db, { name: params.name, creatorId: params.ownerId });
}

export async function createTeam(
  db: Database,
  params: { orgId: string; name: string; ownerId: string },
): Promise<string> {
  return createTeamWithGrants(db, {
    orgId: params.orgId,
    name: params.name,
    creatorId: params.ownerId,
  });
}

export function createSession(
  db: Database,
  params: {
    teamId: string;
    topic: string;
    deadlineMs?: number;
    kind?: SessionKind;
  },
): SessionRecord {
  const id = crypto.randomUUID();
  const now = Date.now();
  const kind = params.kind ?? "standard";
  db.prepare(
    `INSERT INTO sessions (
       id, team_id, topic, deadline_ms, status, kind, created_at_ms
     ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run(id, params.teamId, params.topic, params.deadlineMs ?? null, kind, now);
  const row = db.query<SessionRow, [string]>(`SELECT * FROM sessions WHERE id = ? LIMIT 1`).get(id);
  if (row === null) throw new Error("session insert failed");
  void publishSessionBelongsToTeam(id, params.teamId);
  return mapSession(row);
}

export function createOnboardingSession(
  db: Database,
  params: {
    teamId: string;
    orgName: string;
    teamName: string;
  },
): SessionRecord {
  return createSession(db, {
    teamId: params.teamId,
    topic: buildOnboardingSessionTopic(params.orgName, params.teamName),
    kind: "onboarding",
  });
}

export function closeSession(db: Database, sessionId: string): void {
  db.prepare(`UPDATE sessions SET status = 'closed' WHERE id = ?`).run(sessionId);
}

export function markSessionInterviewComplete(
  db: Database,
  sessionId: string,
  params: { summary: string; nextSessionOptions: string[] },
): SessionRecord | null {
  const completedAtMs = Date.now();
  db.prepare(
    `UPDATE sessions
     SET status = 'alignment',
         interview_summary = ?,
         next_session_options = ?,
         interview_completed_at_ms = ?
     WHERE id = ?`,
  ).run(params.summary.trim(), JSON.stringify(params.nextSessionOptions), completedAtMs, sessionId);
  return getSession(db, sessionId);
}

export function patchSession(
  db: Database,
  sessionId: string,
  params: { topic?: string; deadlineMs?: number | null },
): SessionRecord | null {
  const existing = getSession(db, sessionId);
  if (existing === null) return null;
  const topic = params.topic !== undefined ? params.topic : existing.topic;
  const deadlineMs = params.deadlineMs !== undefined ? params.deadlineMs : existing.deadlineMs;
  db.prepare(`UPDATE sessions SET topic = ?, deadline_ms = ? WHERE id = ?`).run(
    topic,
    deadlineMs,
    sessionId,
  );
  return getSession(db, sessionId);
}

export function getSession(db: Database, sessionId: string): SessionRecord | null {
  const row = db
    .query<SessionRow, [string]>(`SELECT * FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId);
  return row === null ? null : mapSession(row);
}

function sessionResource(sessionId: string) {
  return { type: ResourceType.Session, id: sessionId };
}

async function listFacilitationAccountIds(sessionId: string): Promise<string[]> {
  const resource = sessionResource(sessionId);
  const accountIds = new Set<string>();

  for (const feature of [Feature.Admin, Feature.Facilitation] as const) {
    for (const accountId of await listGrantScopeIdsForResource(
      resource,
      feature,
      ScopeType.Account,
    )) {
      accountIds.add(accountId);
    }
    for (const teamId of await listGrantScopeIdsForResource(resource, feature, ScopeType.Team)) {
      for (const accountId of await listAccountIdsForTeam(teamId, Feature.Member)) {
        accountIds.add(accountId);
      }
    }
  }

  return [...accountIds];
}

export async function syncFacilitationThreadGrants(
  _db: Database,
  sessionId: string,
): Promise<void> {
  const threadId = facilitationChatThreadId(sessionId);

  const holders = new Set(await listFacilitationAccountIds(sessionId));
  const thread = threadResource(threadId);
  const currentGrantees = await listGrantScopeIdsForResource(
    thread,
    Feature.Read,
    ScopeType.Account,
  );

  const client = requireAuthzServiceClient();
  for (const accountId of currentGrantees) {
    if (!holders.has(accountId)) {
      await client.revokeGrant({
        scope: accountScope(accountId),
        resource: thread,
        feature: Feature.Read,
      });
      await client.revokeGrant({
        scope: accountScope(accountId),
        resource: thread,
        feature: Feature.Write,
      });
    }
  }

  for (const accountId of holders) {
    await client.grant({
      scope: accountScope(accountId),
      resource: thread,
      feature: Feature.Read,
    });
    await client.grant({
      scope: accountScope(accountId),
      resource: thread,
      feature: Feature.Write,
    });
  }
}

export type SessionListItem = SessionRecord & {
  role: "facilitator" | "participant";
};

type SessionListRow = SessionRow;

export async function userHasSessionAccess(
  _db: Database,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  return hasSessionAccess(userId, sessionId);
}

export async function userHasAnyAccessibleSession(_db: Database, userId: string): Promise<boolean> {
  return userHasAnySessionParticipantGrant(userId);
}

export async function listSessionsForUser(
  db: Database,
  userId: string,
  teamId?: string,
): Promise<SessionListItem[]> {
  const rows = db
    .query<SessionListRow, [string | null]>(
      `SELECT id, team_id, topic, deadline_ms, status, kind, created_at_ms,
              interview_summary, next_session_options, interview_completed_at_ms
       FROM sessions
       WHERE (?1 IS NULL OR team_id = ?1)
       ORDER BY created_at_ms DESC`,
    )
    .all(teamId ?? null);

  const items: SessionListItem[] = [];
  for (const row of rows) {
    if (!(await hasSessionAccess(userId, row.id))) continue;
    items.push({
      ...mapSession(row),
      role: await sessionRoleForUser(db, row.id, userId),
    });
  }
  return items;
}

export function getActiveOnboardingSessionForTeam(db: Database, teamId: string): string | null {
  const row = db
    .query<{ id: string }, [string]>(
      `SELECT id FROM sessions
       WHERE team_id = ? AND kind = 'onboarding' AND status != 'closed'
       LIMIT 1`,
    )
    .get(teamId);
  return row?.id ?? null;
}

export function getSessionLinkAccess(db: Database, sessionId: string): SessionLinkAccess {
  const row = db
    .query<{ link_access: string }, [string]>(
      `SELECT link_access FROM sessions WHERE id = ? LIMIT 1`,
    )
    .get(sessionId);
  return row?.link_access === "anyone" ? "anyone" : "restricted";
}

export function setSessionLinkAccess(
  db: Database,
  sessionId: string,
  access: SessionLinkAccess,
): void {
  db.prepare(`UPDATE sessions SET link_access = ? WHERE id = ?`).run(access, sessionId);
}

export function getSessionLinkGrantRole(db: Database, sessionId: string): SessionLinkGrantRole {
  const row = db
    .query<{ link_grant_role: string }, [string]>(
      `SELECT link_grant_role FROM sessions WHERE id = ? LIMIT 1`,
    )
    .get(sessionId);
  return row?.link_grant_role === "facilitation" ? "facilitation" : "participant";
}

export function setSessionLinkGrantRole(
  db: Database,
  sessionId: string,
  role: SessionLinkGrantRole,
): void {
  db.prepare(`UPDATE sessions SET link_grant_role = ? WHERE id = ?`).run(role, sessionId);
}

export async function sessionRoleForUser(
  _db: Database,
  sessionId: string,
  userId: string,
): Promise<"facilitator" | "participant"> {
  return (await isSessionFacilitator(userId, sessionId)) ? "facilitator" : "participant";
}
