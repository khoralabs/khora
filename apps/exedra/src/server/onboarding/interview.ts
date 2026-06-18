import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";
import { grantSessionCreatorAccess } from "../authz";
import {
  completeTeamMemberOnboardingInterview,
  getOrg,
  getTeam,
  setTeamMemberOnboardingSession,
} from "../db/membership";
import { loadThreadMessages } from "../db/messages";
import { closeSession, createOnboardingSession, getOrCreateInterviewThread } from "../db/sessions";
import { bootstrapSessionMemoriesForTeamSession } from "../memories/bootstrap-session";
import { seedOnboardingMemories } from "../memories/seed-onboarding";

export function createOnboardingInterviewForMember(
  db: Database,
  params: {
    teamId: string;
    userId: string;
    orgName: string;
    teamName: string;
  },
): { sessionId: string; threadId: string } {
  const session = createOnboardingSession(db, {
    teamId: params.teamId,
    orgName: params.orgName,
    teamName: params.teamName,
  });

  grantSessionCreatorAccess(db, params.userId, session.id);

  bootstrapSessionMemoriesForTeamSession(db, {
    teamId: params.teamId,
    sessionId: session.id,
    userIds: [params.userId],
  });

  setTeamMemberOnboardingSession(db, {
    teamId: params.teamId,
    userId: params.userId,
    sessionId: session.id,
  });

  const threadId = getOrCreateInterviewThread(db, {
    sessionId: session.id,
    userId: params.userId,
  });

  return { sessionId: session.id, threadId };
}

function collectBeliefsFromThread(messages: UIMessage[]): string[] {
  const beliefs: string[] = [];
  for (const message of messages) {
    const metadata = message.metadata as
      | { beliefFlags?: { belief: string; messageId: string }[] }
      | undefined;
    for (const flag of metadata?.beliefFlags ?? []) {
      const trimmed = flag.belief.trim();
      if (trimmed.length > 0) beliefs.push(trimmed);
    }
  }
  return beliefs;
}

export function finishOnboardingInterview(args: {
  db: Database;
  threadId: string;
  sessionId: string;
  teamId: string;
  userId: string;
  summary: string;
}): void {
  const { db, threadId, sessionId, teamId, userId, summary } = args;
  const team = getTeam(db, teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  if (team === null || org === null) {
    throw new Error("Team or organization not found");
  }

  const messages = loadThreadMessages(db, threadId);
  const beliefs = collectBeliefsFromThread(messages);

  seedOnboardingMemories({
    orgId: org.id,
    teamId,
    userId,
    summary: summary.trim(),
    beliefs,
  });

  completeTeamMemberOnboardingInterview(db, { teamId, userId });
  closeSession(db, sessionId);
}
