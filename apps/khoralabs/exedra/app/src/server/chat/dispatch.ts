import type { GenerateResponseWorkflowParams } from "@khoralabs/exedra-workflows-generate-response/generate-response-workflow";
import { Render } from "@renderinc/sdk";
import { EXEDRA_CONVERSATIONAL_AGENT_ID } from "../authz/facts";
import { getDb } from "../db/index";
import { getTeam } from "../db/membership";
import { getSession } from "../db/sessions";
import { orgSessionScope, userSessionScope } from "../memories/namespaces";
import { getChatService } from "./service";
import { parseSessionChatThreadId } from "./thread-ids";

function requireWorkflowConfig(): {
  localDevUrl?: string;
  slug: string;
  token: string;
  useLocalDev: boolean;
} {
  const useLocalDev = process.env.RENDER_USE_LOCAL_DEV?.trim() === "true";
  const token = process.env.RENDER_API_KEY?.trim();
  const localDevUrl = process.env.RENDER_LOCAL_DEV_URL?.trim() || undefined;
  const slug = process.env.RENDER_GENERATE_RESPONSE_WORKFLOW_SLUG?.trim() ?? "generate-response";
  if (!useLocalDev && (token === undefined || token.length === 0)) {
    throw new Error("RENDER_API_KEY is required to dispatch generate-response");
  }
  if (useLocalDev && localDevUrl === undefined) {
    throw new Error("RENDER_LOCAL_DEV_URL is required when RENDER_USE_LOCAL_DEV=true");
  }
  return { localDevUrl, slug, token: token || "local-dev", useLocalDev };
}

export async function dispatchGenerateResponseForChat(input: {
  chatThreadId: string;
  userId: string;
  userTimeZone?: string;
}): Promise<void> {
  const db = getDb();
  const parsedThread = parseSessionChatThreadId(input.chatThreadId);
  if (parsedThread === null) throw new Error(`invalid chat thread id: ${input.chatThreadId}`);
  const session = getSession(db, parsedThread.sessionId);
  if (session === null) throw new Error(`session not found: ${parsedThread.sessionId}`);
  const team = await getTeam(db, session.teamId);
  if (team === null) throw new Error(`team not found: ${session.teamId}`);

  const posts = await getChatService().listPosts({ threadId: input.chatThreadId, limit: 100 });
  const skillName =
    parsedThread.kind === "interview" ? "conduct-interview" : "facilitate-conversation";
  const responseId = crypto.randomUUID();
  const params: GenerateResponseWorkflowParams = {
    responseId,
    agent: {
      id: EXEDRA_CONVERSATIONAL_AGENT_ID,
      name: "Exedra Agent",
      actingFor: { type: "agent", id: EXEDRA_CONVERSATIONAL_AGENT_ID },
    },
    model: {
      id: process.env.GENERATE_RESPONSE_DEFAULT_MODEL?.trim() || "anthropic/claude-sonnet-4.6",
      maxSteps: 8,
    },
    context: {
      sessionId: session.id,
      threadId: input.chatThreadId,
      userId: input.userId,
      orgId: team.orgId,
      teamId: team.id,
      messages: posts.items,
      directives: {
        skillNames: [skillName],
        instructions: [`Session topic: ${session.topic}`],
        userTimeZone: input.userTimeZone,
      },
      invocationContext: {
        threadKind: parsedThread.kind,
      },
    },
    access: {
      memoryNamespaces: [
        {
          namespace: orgSessionScope(team.orgId, team.id, session.id),
          scope: "session",
          resourceType: "session",
          resourceId: session.id,
        },
        ...(parsedThread.kind === "interview"
          ? [
              {
                namespace: userSessionScope(input.userId, team.orgId, team.id, session.id),
                scope: "personal" as const,
                resourceType: "account",
                resourceId: input.userId,
              },
            ]
          : []),
      ],
      chatThread: { threadId: input.chatThreadId, write: true },
    },
    output: {
      mode: "message",
      chat: {
        threadId: input.chatThreadId,
        postId: responseId,
        streamDeltas: true,
      },
    },
  };

  const { localDevUrl, slug, token, useLocalDev } = requireWorkflowConfig();
  const render = new Render({ localDevUrl, token, useLocalDev });
  await render.workflows.startTask(`${slug}/generateAgentResponse`, [params]);
}
