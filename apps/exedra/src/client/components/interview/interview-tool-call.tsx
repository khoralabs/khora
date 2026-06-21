import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { ToolCallDisplay } from "@/lib/interview-api";
import { normalizeNextSessionOptions } from "@/lib/interview-api";

import { toolStateForDisplay } from "./interview-chat-tool-utils";

function formatCompletionToolInput(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  const record = input as { summary?: unknown; nextSessionOptions?: unknown };
  const summary = typeof record.summary === "string" ? record.summary : undefined;
  const nextSessionOptions = normalizeNextSessionOptions(record.nextSessionOptions);
  return {
    ...(summary !== undefined ? { summary } : {}),
    ...(nextSessionOptions.length > 0 ? { nextSessionOptions } : {}),
  };
}

function FlagBeliefToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  const displayState = toolStateForDisplay(toolCall.state);

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader state={displayState} title="Beliefs flagged" type="tool-flagBelief" />
      <ToolContent>
        {toolCall.input !== undefined ? <ToolInput input={toolCall.input} /> : null}
        <ToolOutput errorText={toolCall.errorText} output={toolCall.output} />
      </ToolContent>
    </Tool>
  );
}

function isSessionCompletionTool(toolName: string): boolean {
  return toolName === "completeSession" || toolName === "completeOnboardingInterview";
}

function CompleteSessionToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  const displayState = toolStateForDisplay(toolCall.state);
  const legacy = toolCall.toolName === "completeOnboardingInterview";

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader
        state={displayState}
        title={legacy ? "Onboarding complete" : "Session complete"}
        type={legacy ? "tool-completeOnboardingInterview" : "tool-completeSession"}
      />
      <ToolContent>
        {toolCall.input !== undefined ? (
          <ToolInput input={formatCompletionToolInput(toolCall.input)} />
        ) : null}
        <ToolOutput errorText={toolCall.errorText} output={toolCall.output} />
      </ToolContent>
    </Tool>
  );
}

export function InterviewToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  if (toolCall.toolName === "flagBelief") {
    return <FlagBeliefToolCall toolCall={toolCall} />;
  }

  if (isSessionCompletionTool(toolCall.toolName)) {
    return <CompleteSessionToolCall toolCall={toolCall} />;
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
