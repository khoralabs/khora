import type { ObpNegotiatorGeneration } from "@cfd/obp-negotiator";

export type NegotiationEndPayload = { reason?: string };

function collectToolResultMapForStep(
  step: ObpNegotiatorGeneration["steps"][number],
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

/**
 * Derives an end-negotiation payload from the model run when session hooks did not observe
 * {@code obp_end_negotiation} (e.g. composed toolkits / AI SDK wiring gaps).
 */
export function negotiationEndPayloadFromGeneration(
  generation: ObpNegotiatorGeneration,
): NegotiationEndPayload | null {
  let last: NegotiationEndPayload | null = null;
  for (const step of generation.steps) {
    const resultById = collectToolResultMapForStep(step);
    const calls = [
      ...(step.toolCalls ?? []),
      ...(step.staticToolCalls ?? []),
      ...(step.dynamicToolCalls ?? []),
    ];
    for (const tc of calls) {
      const c = tc as { toolCallId: string; toolName: string; input?: unknown };
      if (c.toolName !== "obp_end_negotiation") continue;
      const out = resultById.get(c.toolCallId);
      if (out?.error !== undefined) continue;
      const reason = (c.input as { reason?: string } | undefined)?.reason;
      last = { reason };
    }
  }
  return last;
}
