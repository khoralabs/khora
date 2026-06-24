import { getChatServiceClient } from "../chat/service-client.js";

type BeliefFlagMetadata = {
  beliefFlags?: { belief: string; messageId: string }[];
};

export type IntegrateBeliefParams = {
  userId: string;
  threadId: string;
  sessionId: string;
  beliefId: string;
  belief?: string;
  feedback: "confirmed" | "corrected";
  correction?: string;
};

function parseBeliefGlobalIndex(beliefId: string): number | null {
  const sep = beliefId.lastIndexOf(":");
  if (sep < 0) return null;
  const index = Number.parseInt(beliefId.slice(sep + 1), 10);
  return Number.isFinite(index) ? index : null;
}

export async function resolveBeliefText(
  threadId: string,
  beliefId: string,
): Promise<string | null> {
  const globalIndex = parseBeliefGlobalIndex(beliefId);
  if (globalIndex === null) return null;

  const { items: messages } = await getChatServiceClient().listPosts({ threadId, limit: 100 });
  let count = 0;
  for (const message of messages) {
    const metadata = message.metadata as BeliefFlagMetadata | undefined;
    for (const flag of metadata?.beliefFlags ?? []) {
      if (count === globalIndex) {
        return flag.belief.trim() || null;
      }
      count++;
    }
  }
  return null;
}

export async function resolveBeliefTextForIntegration(
  params: IntegrateBeliefParams,
): Promise<string> {
  if (params.feedback === "corrected") {
    return params.correction?.trim() ?? "";
  }
  return params.belief?.trim() || (await resolveBeliefText(params.threadId, params.beliefId)) || "";
}
