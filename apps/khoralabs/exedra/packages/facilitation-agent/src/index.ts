import type { AgentRegistry } from "@khoralabs/agent-capabilities";
import type { AgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import { generateText, type LanguageModel, type UIMessage } from "ai";
import { nanoid } from "nanoid";

import type { FacilitationEventKind } from "../../../shared/facilitation-workflow.ts";
import { ensureFacilitationAgentRegistered } from "./identity.ts";

export type FacilitationContext = {
  sessionTopic: string;
  participantName: string;
  messages: UIMessage[];
  beliefs: string[];
};

export type FacilitationEventOutput = {
  assistantId: string;
  parts: UIMessage["parts"];
};

type FacilitationSessionInput = {
  prompt: string;
  event: FacilitationEventKind;
};

type FacilitationSessionContext = {
  model: LanguageModel;
};

function formatTranscript(messages: UIMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text.length === 0) continue;
    lines.push(`${message.role === "user" ? "Participant" : "Agent"}: ${text}`);
  }
  return lines.join("\n\n");
}

function buildParticipantCompletedPrompt(context: FacilitationContext): string {
  const beliefs =
    context.beliefs.length > 0
      ? context.beliefs.map((belief) => `- ${belief}`).join("\n")
      : "- (none flagged)";

  return `Session topic: ${context.sessionTopic}
Participant: ${context.participantName}

The participant just completed their individual interview. Write a concise facilitation thread post for session facilitators.

Structure:
1. Heading with participant name and "interview complete"
2. **Key takeaways** — 3-5 bullets summarizing their perspective
3. **Beliefs flagged** — list or note if none
4. **Open questions** — 2-3 items facilitators may want to probe in synthesis

Beliefs flagged during interview:
${beliefs}

Interview transcript:
${formatTranscript(context.messages)}`;
}

export async function runFacilitationEvent(args: {
  registry: AgentRegistry;
  model: LanguageModel;
  sessionId: string;
  createTelemetry?: () => AgentTelemetry;
  context: FacilitationContext;
  event: FacilitationEventKind;
}): Promise<FacilitationEventOutput> {
  if (args.event !== "participant_interview_completed") {
    throw new Error(`Unsupported facilitation event: ${args.event}`);
  }

  const tel = (
    args.createTelemetry ??
    (() => {
      throw new Error("runFacilitationEvent requires createTelemetry");
    })
  )();

  const { identity } = await ensureFacilitationAgentRegistered(args.registry, args.sessionId);
  const prompt = buildParticipantCompletedPrompt(args.context);

  const session = args.registry.createSession(identity.agentId, {
    sessionId: args.sessionId,
    hooks: tel.sessionHooks,
    ctx: { model: args.model },
    run: async ({ input, context }) => {
      const { prompt: sessionPrompt, event } = input as FacilitationSessionInput;
      const { model } = context as FacilitationSessionContext;
      const result = await generateText({
        model,
        prompt: sessionPrompt,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "facilitation-event",
          metadata: {
            sessionId: args.sessionId,
            event,
          },
        },
      });

      const text = result.text.trim();
      return {
        assistantId: nanoid(),
        parts: [
          { type: "text", text: text.length > 0 ? text : "Participant interview completed." },
        ],
      };
    },
  });

  return session.start<FacilitationSessionInput, FacilitationEventOutput>({
    prompt,
    event: args.event,
  });
}

export { ensureFacilitationAgentRegistered } from "./identity.ts";
export { runFacilitationEvent as default };
