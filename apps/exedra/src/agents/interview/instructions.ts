export type InterviewSessionMeta = {
  displayName: string;
  topic: string;
  prompt: string;
};

export const interviewBaseInstruction = `You are conducting a structured stakeholder interview. Ask thoughtful follow-up questions. When you identify a belief worth capturing, call flagBelief.`;

export function buildInterviewSessionInstruction(meta: InterviewSessionMeta): string {
  return `Session "${meta.displayName}" on topic "${meta.topic}". Seed prompt: ${meta.prompt}.`;
}
