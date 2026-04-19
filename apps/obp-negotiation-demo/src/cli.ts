import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runLlmNegotiation } from "./llm/p2pSession.ts";
import { getNegotiationScenario, NEGOTIATION_SCENARIO_IDS } from "./scenarios/index.ts";

function printUsage(): void {
  console.error(
    `Usage: bun run demo agent <${NEGOTIATION_SCENARIO_IDS.join(" | ")}>`,
  );
}

function buildLogFilePath(): string {
  const argsPart =
    process.argv.slice(2).join("_").replace(/[^a-zA-Z0-9_-]/g, "_") || "agent";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = path.join(process.cwd(), ".obp-demo-logs");
  return path.join(logDir, `${argsPart}_${ts}.jsonl`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const scenarioId = process.argv[3];

  if (cmd !== "agent" || scenarioId === undefined) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    const logFilePath = buildLogFilePath();
    await mkdir(path.dirname(logFilePath), { recursive: true });
    console.log("[demo] log file", logFilePath);

    const scenario = await getNegotiationScenario(scenarioId);
    const result = await runLlmNegotiation({ scenario, logFilePath });
    console.log("\n[result]", result);
    if (result.status === "error") {
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    printUsage();
    process.exitCode = 1;
  }
}

await main();
