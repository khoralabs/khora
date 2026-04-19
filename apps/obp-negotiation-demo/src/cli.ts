import { buildAgents } from "./agents/buildAgents.ts";
import { runLlmNegotiation } from "./llm/p2pSession.ts";
import { createDemoStack } from "./obp/demoPersistence.ts";
import { runAdversarial } from "./scenarios/adversarial.ts";
import { runCollaborative } from "./scenarios/collaborative.ts";
import type { TranscriptStep } from "./scenarios/types.ts";

function printSteps(title: string, steps: TranscriptStep[]): void {
  console.log(`\n=== ${title} ===\n`);
  for (const step of steps) {
    if (step.kind === "info") {
      console.group(`[info] ${step.label}`);
      console.log(step.data);
      console.groupEnd();
      continue;
    }
    if (step.ok) {
      console.group(`[obp] ${step.op} ok`);
      console.log(step.detail);
      console.groupEnd();
    } else {
      console.group(`[obp] ${step.op} FAIL ${step.code}`);
      console.log(step.message);
      console.groupEnd();
    }
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2] ?? "collaborative";
  const agents = await buildAgents();

  if (arg === "collaborative" || arg === "collab") {
    const stack = createDemoStack();
    const steps = await runCollaborative(agents, stack);
    printSteps("Collaborative negotiation", steps);
    return;
  }

  if (arg === "adversarial" || arg === "adv") {
    const steps = await runAdversarial(agents);
    printSteps("Adversarial negotiation (invariant failures)", steps);
    return;
  }

  if (arg === "llm" || arg === "negotiate") {
    const result = await runLlmNegotiation();
    console.log("\n[result]", result);
    if (result.status === "error") {
      process.exitCode = 1;
    }
    return;
  }

  console.error(`Usage: bun run src/cli.ts [collaborative|adversarial|llm]`);
  process.exitCode = 1;
}

await main();
