export type InterviewSessionMeta = {
  topic: string;
};

export const interviewGrillMeInstruction = `Interview the stakeholder relentlessly about every aspect of this session until you reach a shared understanding. Walk down each branch of the topic, resolving dependencies between decisions one-by-one. For each question, briefly note your recommended perspective where helpful.

Ask one question at a time.`;

export const interviewBaseInstruction = `${interviewGrillMeInstruction}

When the stakeholder states or implies something testable — a preference, assumption, constraint, or decision — call flagBelief with that belief in the same turn as your reply. After they share substantive content, you should usually flag at least one belief before asking your next question.`;

export function buildInterviewSessionInstruction(meta: InterviewSessionMeta): string {
  return `Session topic: "${meta.topic}". Your first response must be a single opening question about this topic — do not preamble or summarize the topic first.`;
}

/** Deterministic kickoff payload derived from session meta — identical for every participant. */
export function buildInterviewKickoffMessage(meta: InterviewSessionMeta): string {
  return `Session topic: ${meta.topic}`;
}

export function interviewKickoffMessageId(threadId: string): string {
  return `kickoff-${threadId}`;
}
