import type { ObpNegotiationGeneration } from "./createObpNegotiationToolLoopAgent.ts";

export function logObserverHeader(title: string): void {
  console.log(`\n======== ${title} ========\n`);
}

export function logGeneration(args: {
  round: number;
  role: "seller" | "buyer";
  system: string;
  user: string;
  generation: ObpNegotiationGeneration;
}): void {
  console.group(`[observer] round ${args.round} ${args.role}`);
  // console.log("--- system ---\n", args.system);
  // console.log("--- user ---\n", args.user);
  // console.log("--- finishReason ---", args.generation.finishReason);
  // const text = args.generation.text?.trim() ?? "";
  // if (text !== "") {
  //   console.log("--- assistant text ---\n", text.slice(0, 4000));
  // }
  // console.log("--- steps ---", args.generation.steps.length);
  let toolCallCount = 0;
  for (const step of args.generation.steps) {
    const n = step.toolCalls?.length ?? 0;
    toolCallCount += n;
    if (n > 0) {
      console.log("toolCalls:", step.toolCalls);
    }
  }
  console.log("--- total tool calls ---", toolCallCount);
  if (toolCallCount === 0) {
    console.log("(noop: no tools invoked this turn)");
  }
  console.groupEnd();
}
