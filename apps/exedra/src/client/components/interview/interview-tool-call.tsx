import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { ToolCallDisplay } from "@/lib/interview-api";

import { toolStateForDisplay } from "./interview-chat-tool-utils";

function readBeliefInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null || !("belief" in input)) return null;
  const belief = (input as { belief?: unknown }).belief;
  return typeof belief === "string" && belief.trim().length > 0 ? belief.trim() : null;
}

function readOnboardingSummaryInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null || !("summary" in input)) return null;
  const summary = (input as { summary?: unknown }).summary;
  return typeof summary === "string" && summary.trim().length > 0 ? summary.trim() : null;
}

function FlagBeliefToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  const belief = readBeliefInput(toolCall.input);
  const displayState = toolStateForDisplay(toolCall.state);

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader state={displayState} title="Belief flagged" type="tool-flagBelief" />
      <ToolContent className="space-y-3">
        {belief !== null ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What the interviewer heard
            </p>
            <p className="text-sm leading-relaxed">{belief}</p>
          </div>
        ) : null}

        {toolCall.state === "error" && toolCall.errorText !== undefined ? (
          <p className="text-sm text-destructive">{toolCall.errorText}</p>
        ) : toolCall.state === "running" ? (
          <p className="text-sm text-muted-foreground">Adding to your beliefs panel…</p>
        ) : toolCall.state === "completed" ? (
          <p className="text-sm text-muted-foreground">
            Added to your beliefs panel. Confirm or refine it when you&apos;re ready.
          </p>
        ) : null}
      </ToolContent>
    </Tool>
  );
}

function CompleteOnboardingToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  const summary = readOnboardingSummaryInput(toolCall.input);
  const displayState = toolStateForDisplay(toolCall.state);

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader
        state={displayState}
        title="Onboarding complete"
        type="tool-completeOnboardingInterview"
      />
      <ToolContent className="space-y-3">
        {summary !== null ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Summary captured
            </p>
            <p className="text-sm leading-relaxed">{summary}</p>
          </div>
        ) : null}

        {toolCall.state === "error" && toolCall.errorText !== undefined ? (
          <p className="text-sm text-destructive">{toolCall.errorText}</p>
        ) : toolCall.state === "running" ? (
          <p className="text-sm text-muted-foreground">Saving onboarding summary…</p>
        ) : toolCall.state === "completed" ? (
          <p className="text-sm text-muted-foreground">
            Your onboarding interview is marked complete and team memories are being seeded.
          </p>
        ) : null}
      </ToolContent>
    </Tool>
  );
}

export function InterviewToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  if (toolCall.toolName === "flagBelief") {
    return <FlagBeliefToolCall toolCall={toolCall} />;
  }

  if (toolCall.toolName === "completeOnboardingInterview") {
    return <CompleteOnboardingToolCall toolCall={toolCall} />;
  }

  const toolType = `tool-${toolCall.toolName}` as `tool-${string}`;

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader
        state={toolStateForDisplay(toolCall.state)}
        title={toolCall.toolName}
        type={toolType}
      />
      <ToolContent>
        {toolCall.input !== undefined ? <ToolInput input={toolCall.input} /> : null}
        <ToolOutput errorText={toolCall.errorText} output={toolCall.output} />
      </ToolContent>
    </Tool>
  );
}
