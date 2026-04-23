import type { InMemoryThreadContext } from "./in-memory-thread-context.ts";
import type { ThreadMessage } from "./messages.ts";

/**
 * Minimal `ToolLoopAgent.generate()` / `GenerateTextResult` step shape to append a turn to a thread. Structural only.
 */
export type ToolLoopGenerationSnapshot = {
  steps: Array<{
    text?: string;
    toolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; input: unknown }>;
    staticToolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; input: unknown }>;
    dynamicToolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; input: unknown }>;
    toolResults?: ReadonlyArray<unknown>;
    staticToolResults?: ReadonlyArray<unknown>;
    dynamicToolResults?: ReadonlyArray<unknown>;
  }>;
};

function collectToolResultMap(
  step: ToolLoopGenerationSnapshot["steps"][number],
): Map<string, { output?: unknown; error?: unknown }> {
  const m = new Map<string, { output?: unknown; error?: unknown }>();
  const all = [
    ...(step.toolResults ?? []),
    ...(step.staticToolResults ?? []),
    ...(step.dynamicToolResults ?? []),
  ];
  for (const tr of all) {
    const r = tr as { toolCallId: string; type?: string; output?: unknown; error?: unknown };
    if (r.type === "tool-result") {
      m.set(r.toolCallId, { output: r.output });
    } else if (r.type === "tool-error") {
      m.set(r.toolCallId, { error: r.error });
    }
  }
  return m;
}

/** Builds AI SDK 6 `parts` (text + `dynamic-tool` rows) for one `ToolLoopAgent.generate` turn. */
export function buildAssistantPartsFromGeneration(
  generation: ToolLoopGenerationSnapshot,
): ThreadMessage["parts"] {
  const parts: ThreadMessage["parts"] = [];
  for (const step of generation.steps) {
    const text = step.text?.trim();
    if (text) {
      parts.push({ type: "text", text, state: "done" });
    }
    const resultById = collectToolResultMap(step);
    const calls = [
      ...(step.toolCalls ?? []),
      ...(step.staticToolCalls ?? []),
      ...(step.dynamicToolCalls ?? []),
    ];
    for (const tc of calls) {
      const c = tc as { toolCallId: string; toolName: string; input: unknown };
      const out = resultById.get(c.toolCallId);
      if (out === undefined) {
        parts.push({
          type: "dynamic-tool",
          toolName: c.toolName,
          toolCallId: c.toolCallId,
          state: "input-available",
          input: c.input,
        });
      } else if (out.error !== undefined) {
        parts.push({
          type: "dynamic-tool",
          toolName: c.toolName,
          toolCallId: c.toolCallId,
          state: "output-error",
          input: c.input,
          errorText: String(out.error),
        });
      } else {
        parts.push({
          type: "dynamic-tool",
          toolName: c.toolName,
          toolCallId: c.toolCallId,
          state: "output-available",
          input: c.input,
          output: out.output,
        });
      }
    }
  }
  return parts;
}

/**
 * Appends one `ToolLoopAgent.generate()` result as a single assistant `UIMessage` to the public thread.
 * The non-streaming `GenerateTextResult` in AI SDK 6 has no `toUIMessageStream`; we build `parts` from
 * `steps` and tool result lists.
 */
export async function mirrorGenerationToThread(args: {
  generation: ToolLoopGenerationSnapshot;
  ctx: InMemoryThreadContext;
  authorId: string;
}): Promise<void> {
  const { generation, ctx, authorId } = args;
  const parts = buildAssistantPartsFromGeneration(generation);
  if (parts.length === 0) {
    return;
  }
  await ctx.postMessage({ authorId, role: "assistant", parts });
}
