import type { UIMessage } from "ai";

export type InterviewSessionMeta = {
  topic: string;
};

export type OnboardingInterviewMeta = {
  orgName: string;
  teamName: string;
};

export const ONBOARDING_MIN_USER_TURNS = 5;

export const interviewGrillMeInstruction = `Interview the stakeholder thoroughly about every aspect of this session until you reach a shared understanding. Walk down each branch of the topic, resolving dependencies between decisions one-by-one. Use first principles reasoning and empathetic reasoning from the stakeholder's perspective.

Your primary goal is to ask questions that draw out their knowledge, preferences, and constraints. Be a thought partner along the way: if they ask a question, answer it helpfully and concisely before continuing the interview — do not ignore or deflect their question.

After each message, briefly acknowledge what they shared before your next question — reflect a key point, confirm your understanding, note why it matters, or respond to what they asked. Keep that response concise (one or two sentences). Ask one question at a time; do not skip straight to the next question without responding to their message first.`;

export const interviewCompletionInstruction = `When you have a solid shared understanding, call completeSession with a concise summary and 2–4 nextSessionOptions — specific follow-up session topics to go deeper. Call completeSession before any user-visible reply on that turn. Do not ask another interview question in that turn or after calling the tool. Your summary seeds session memory; nextSessionOptions suggest where to continue later.`;

export const postInterviewInstruction = `This interview session is complete from the facilitator's perspective. Do not conduct a new structured interview or ask probing discovery questions. Help the stakeholder refine beliefs, answer follow-up questions, or clarify anything they raise. Keep responses concise and supportive.`;

export const interviewBaseInstruction = `${interviewGrillMeInstruction}

${interviewCompletionInstruction}

When the stakeholder states or implies something testable — a preference, assumption, constraint, or decision — call flagBelief with every distinct belief you can infer from their message in the same turn as your reply. Include implied beliefs, not just the headline takeaway; a rich answer often supports several separate beliefs. After they share substantive content (answers, context, or decisions — not mere questions to you), flag all inferrable beliefs before asking your next question. If nothing testable was shared, omit the tool call.`;

export function buildInterviewSessionInstruction(meta: InterviewSessionMeta): string {
  return `Session topic: "${meta.topic}". Your first response must be a single opening question about this topic — do not preamble or summarize the topic first.

When you have explored this topic thoroughly and reached shared understanding, call completeSession with a summary of what you learned and suggested follow-up session topics.`;
}

export function buildOnboardingInterviewInstruction(meta: OnboardingInterviewMeta): string {
  return `This is an onboarding interview to seed team and personal memory namespaces with context about the organization "${meta.orgName}" and the team "${meta.teamName}".

Explore with the stakeholder what the organization does, who the team is, how they work together, their goals, constraints, stakeholders, and any context teammates would need to collaborate effectively.

Your first response must be a single opening question — do not preamble or summarize first.

After at least ${ONBOARDING_MIN_USER_TURNS} substantive exchanges, when you have a solid shared understanding, call completeSession with a concise summary of the org and team context gathered plus 2–4 nextSessionOptions. Do not call it before you are confident the namespaces can be seeded with useful context.`;
}

/** Deterministic kickoff payload derived from session meta — identical for every participant. */
export function buildInterviewKickoffMessage(meta: InterviewSessionMeta): string {
  return `Session topic: ${meta.topic}`;
}

export function interviewKickoffMessageId(threadId: string): string {
  return `kickoff-${threadId}`;
}

export function isKickoffUserMessage(message: Pick<UIMessage, "metadata">): boolean {
  const metadata = message.metadata as { kickoff?: boolean } | undefined;
  return metadata?.kickoff === true;
}

export function countNonKickoffUserTurns(
  messages: readonly Pick<UIMessage, "role" | "metadata">[],
): number {
  return messages.filter((message) => message.role === "user" && !isKickoffUserMessage(message))
    .length;
}
