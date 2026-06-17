import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { ToolCallDisplay } from "@/lib/interview-api";

import { toolStateForDisplay } from "./interview-chat-tool-utils";

export function InterviewToolCall({ toolCall }: { toolCall: ToolCallDisplay }) {
  const toolType = `tool-${toolCall.toolName}` as `tool-${string}`;
  const title =
    toolCall.toolName === "flagBelief"
      ? "Flag belief"
      : toolCall.toolName === "completeOnboardingInterview"
        ? "Complete onboarding"
        : toolCall.toolName;

  return (
    <Tool defaultOpen={process.env.NODE_ENV !== "production"}>
      <ToolHeader state={toolStateForDisplay(toolCall.state)} title={title} type={toolType} />
      <ToolContent>
        {toolCall.input !== undefined ? <ToolInput input={toolCall.input} /> : null}
        <ToolOutput errorText={toolCall.errorText} output={toolCall.output} />
      </ToolContent>
    </Tool>
  );
}
