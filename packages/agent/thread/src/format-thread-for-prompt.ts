import type { DynamicToolUIPart, ToolUIPart, UITools } from "ai";
import { getToolName, isTextUIPart, isToolUIPart } from "ai";
import type { ThreadMessage } from "./messages.ts";

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "<unserializable>";
  }
}

function formatDynamicTool(part: DynamicToolUIPart): string {
  const { toolName, state } = part;
  if (state === "input-streaming" || state === "input-available") {
    return `${toolName}(${safeJson(part.input)})`;
  }
  if (state === "output-available") {
    return `${toolName} => ${safeJson(part.output)}`;
  }
  if (state === "output-error") {
    return `${toolName} => error: ${String(part.errorText)}`;
  }
  if (state === "output-denied") {
    return `${toolName} => denied`;
  }
  if (state === "approval-requested" || state === "approval-responded") {
    return `${toolName}(approval…)`;
  }
  return toolName;
}

function formatStaticTool(part: ToolUIPart<UITools>): string {
  const name = getToolName(part);
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return `${name}(${safeJson(part.input)})`;
    case "output-available":
      return `${name} => ${safeJson(part.output)}`;
    case "output-error":
      return `${name} => error: ${String(part.errorText)}`;
    case "output-denied":
      return `${name} => denied`;
    case "approval-requested":
    case "approval-responded":
      return `${name}(approval…)`;
    default:
      return name;
  }
}

/**
 * Flatten the thread to plaintext for an LLM prompt. Map participant ids to display names for labels.
 */
export function formatThreadForPlaintext(
  messages: ReadonlyArray<ThreadMessage>,
  participantIdToDisplayName: ReadonlyMap<string, string>,
): string {
  if (messages.length === 0) {
    return "(no messages yet)";
  }
  const lines: string[] = [];
  for (const m of messages) {
    const who = participantIdToDisplayName.get(m.metadata.authorId) ?? m.metadata.authorId;
    for (const p of m.parts) {
      if (isTextUIPart(p)) {
        const t = p.text.trim();
        if (t) {
          lines.push(`[text] ${who}: ${t}`);
        }
        continue;
      }
      if (isToolUIPart(p)) {
        const line = p.type === "dynamic-tool" ? formatDynamicTool(p) : formatStaticTool(p);
        lines.push(`[tool] ${who}: ${line}`);
      }
    }
  }
  return lines.join("\n");
}
