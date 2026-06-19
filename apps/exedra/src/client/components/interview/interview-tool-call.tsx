import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { ToolCallDisplay } from "@/lib/interview-api";

import { toolStateForDisplay } from "./interview-chat-tool-utils";

function FlagBeliefToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  const displayState = toolStateForDisplay(toolCall.state);

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader state={displayState} title="Belief flagged" type="tool-flagBelief" />
      <ToolContent>
        {toolCall.input !== undefined ? <ToolInput input={toolCall.input} /> : null}
        <ToolOutput errorText={toolCall.errorText} output={toolCall.output} />
      </ToolContent>
    </Tool>
  );
}

function CompleteOnboardingToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  const displayState = toolStateForDisplay(toolCall.state);

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader
        state={displayState}
        title="Onboarding complete"
        type="tool-completeOnboardingInterview"
      />
      <ToolContent>
        {toolCall.input !== undefined ? <ToolInput input={toolCall.input} /> : null}
        <ToolOutput errorText={toolCall.errorText} output={toolCall.output} />
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
