import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";

import { getOrg, getTeam } from "../db/membership.js";
import { insertMessage, nextMessageIndex } from "../db/messages.js";
import { getOrCreateFacilitationThread } from "../db/sessions.js";
import { relayTurnEvent } from "../interview/turn-relay.js";
import { resolveOrgAgentAuthorForOrg } from "../messages/resolve-author.js";

export function appendFacilitationAssistantMessage(
  db: Database,
  params: {
    facilitationThreadId: string;
    assistantId: string;
    parts: UIMessage["parts"];
  },
): number {
  const teamRow = db
    .query<{ team_id: string }, [string]>(
      `SELECT s.team_id FROM threads t
       JOIN sessions s ON s.id = t.session_id
       WHERE t.id = ? LIMIT 1`,
    )
    .get(params.facilitationThreadId);
  if (teamRow === null) throw new Error("Facilitation thread not found");

  const team = getTeam(db, teamRow.team_id);
  const org = team === null ? null : getOrg(db, team.orgId);
  if (team === null || org === null) throw new Error("Organization not found");

  const messageIndex = nextMessageIndex(db, params.facilitationThreadId);
  const createdAtMs = insertMessage(db, {
    id: params.assistantId,
    threadId: params.facilitationThreadId,
    role: "assistant",
    parts: params.parts.length > 0 ? params.parts : [{ type: "text", text: "" }],
    messageIndex,
    authorDid: org.id,
  });

  const agentAuthor = resolveOrgAgentAuthorForOrg(org);
  relayTurnEvent(params.facilitationThreadId, {
    type: "assistant_message",
    message: {
      id: params.assistantId,
      role: "assistant",
      parts: params.parts,
    },
    createdAtMs,
    author: agentAuthor,
  });

  return createdAtMs;
}

export function appendFacilitationUserMessage(
  db: Database,
  params: {
    facilitationThreadId: string;
    messageId: string;
    authorDid: string;
    text: string;
  },
): number {
  const messageIndex = nextMessageIndex(db, params.facilitationThreadId);
  return insertMessage(db, {
    id: params.messageId,
    threadId: params.facilitationThreadId,
    role: "user",
    parts: [{ type: "text", text: params.text }],
    messageIndex,
    authorDid: params.authorDid,
  });
}

export function resolveFacilitationThreadId(db: Database, sessionId: string): string {
  return getOrCreateFacilitationThread(db, sessionId);
}
