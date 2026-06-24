import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";
import { grantSessionCreatorAccess, grantSessionParticipant } from "../authz";
import { getChatServiceClient } from "../chat/service-client";
import { ensureInterviewChatThread } from "../chat/session-chat";
import {
  completeTeamMemberOnboardingInterview,
  getOrg,
  getTeam,
  setTeamMemberOnboardingSession,
} from "../db/membership";
import { createOnboardingSession } from "../db/sessions";
import { bootstrapSessionMemoriesForTeamSession } from "../memories/bootstrap-session";
import { seedOnboardingMemories } from "../memories/seed-onboarding";

export async function createOnboardingInterviewForMember(
  db: Database,
  params: {
    teamId: string;
    userId: string;
    orgName: string;
    teamName: string;
  },
): Promise<{ sessionId: string; threadId: string }> {
  const session = createOnboardingSession(db, {
    teamId: params.teamId,
    orgName: params.orgName,
    teamName: params.teamName,
  });

  await grantSessionCreatorAccess(params.userId, session.id);
  await grantSessionParticipant(params.userId, session.id);

  await bootstrapSessionMemoriesForTeamSession(db, {
    teamId: params.teamId,
    sessionId: session.id,
    userIds: [params.userId],
  });

  setTeamMemberOnboardingSession(db, {
    teamId: params.teamId,
    userId: params.userId,
    sessionId: session.id,
  });

  const { chatThread } = await ensureInterviewChatThread({
    db,
    sessionId: session.id,
    userId: params.userId,
  });

  return { sessionId: session.id, threadId: chatThread.id };
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

export async function applyOnboardingCompletionSideEffects(args: {
  db: Database;
  threadId: string;
  teamId: string;
  userId: string;
  summary: string;
}): Promise<void> {
  const { db, threadId, teamId, userId, summary } = args;
  const team = await getTeam(db, teamId);
  const org = team === null ? null : getOrg(db, team.orgId);
  if (team === null || org === null) {
    throw new Error("Team or organization not found");
  }

  const { items: messages } = await getChatServiceClient().listPosts({ threadId, limit: 100 });
  const beliefs = collectBeliefsFromThread(messages);

  seedOnboardingMemories({
    orgId: org.id,
    teamId,
    userId,
    summary: summary.trim(),
    beliefs,
  });

  completeTeamMemberOnboardingInterview(db, { teamId, userId });
}
