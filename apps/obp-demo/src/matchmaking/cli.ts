import { mkdir } from "node:fs/promises";
import path from "node:path";
import { textTranscriptPathFromJsonl } from "../negotiation/logger.ts";
import { runMatchmakingSession } from "./llm/session.ts";
import { getMatchmakingScenario, MATCHMAKING_SCENARIO_IDS } from "./scenarios/index.ts";

function printUsage(): void {
  console.error(`Usage: bun run demo:matchmaking <${MATCHMAKING_SCENARIO_IDS.join(" | ")}>`);
}

function buildLogFilePath(): string {
  const argsPart =
    process.argv
      .slice(2)
      .join("_")
      .replace(/[^a-zA-Z0-9_-]/g, "_") || "matchmaking";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = path.join(process.cwd(), ".obp-demo-logs");
  return path.join(logDir, `${argsPart}_${ts}.jsonl`);
}

async function main(): Promise<void> {
  const scenarioId = process.argv[2];

  if (scenarioId === undefined) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    const logFilePath = buildLogFilePath();
    await mkdir(path.dirname(logFilePath), { recursive: true });
    console.log("[demo] log file", logFilePath);
    console.log("[demo] text transcript", textTranscriptPathFromJsonl(logFilePath));

    const scenario = await getMatchmakingScenario(scenarioId);
    const result = await runMatchmakingSession({ scenario, logFilePath });
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
