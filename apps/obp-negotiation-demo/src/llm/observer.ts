import type { ObpNegotiatorGeneration } from "@cfd/obp-negotiator";

export function logObserverHeader(title: string): void {
  console.log(`\n======== ${title} ========\n`);
}

/** One-line summary when `OBP_DEMO_OBSERVER_CONSOLE` is not set (default). */
export function logRoundSummary(args: {
  round: number;
  role: string;
  toolCallCount: number;
}): void {
  console.log(
    `[observer] round ${args.round} ${args.role} toolCalls=${args.toolCallCount}`,
  );
}

/** Verbose per-step tool logs; enable with `OBP_DEMO_OBSERVER_CONSOLE=1`. */
export function logGeneration(args: {
  round: number;
  role: string;
  user: string;
  generation: ObpNegotiatorGeneration;
}): void {
  console.group(`[observer] round ${args.round} ${args.role}`);
  let toolCallCount = 0;
  for (const step of args.generation.steps) {
    const n =
      (step.toolCalls?.length ?? 0) +
      (step.staticToolCalls?.length ?? 0) +
      (step.dynamicToolCalls?.length ?? 0);
    toolCallCount += n;
    if (n > 0) {
      console.log("toolCalls:", step.toolCalls, step.staticToolCalls, step.dynamicToolCalls);
    }
  }
  console.log("--- total tool calls ---", toolCallCount);
  if (toolCallCount === 0) {
    console.log("(noop: no tools invoked this turn)");
  }
  console.groupEnd();
}
