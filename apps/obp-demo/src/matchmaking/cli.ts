import { mkdir } from "node:fs/promises";
import path from "node:path";
import { textTranscriptPathFromJsonl } from "../negotiation/logger.ts";
import { runMatchmakingSession } from "./llm/session.ts";
import {
  jsonlStorePathForNamespace,
  resolveObpDemoMemoriesDbPath,
  resolveObpDemoMemoriesRoot,
} from "./memories/persisted-memories.ts";
import { parseMatchmakingCliArgs } from "./matchmaking-cli-args.ts";
import { getMatchmakingScenario, MATCHMAKING_SCENARIO_IDS } from "./scenarios/index.ts";

function printUsage(): void {
  console.error(
    `Usage: bun run demo:matchmaking <${MATCHMAKING_SCENARIO_IDS.join(" | ")}> [--invite <message>]\n` +
      `       bun run demo:matchmaking <scenario> --invite=<message>\n` +
      `  -i / --invite   Optional opening line from Party A (first seat; first shared thread message).`,
  );
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
  if (process.argv.length < 3) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    const { scenarioId, scenarioOptions } = parseMatchmakingCliArgs(process.argv);
    const scenario = await getMatchmakingScenario(scenarioId, scenarioOptions);
    if (scenario.partyAInvitationMessage !== undefined) {
      console.log("[demo] Party A bootstrap (first shared thread message)");
      console.log(scenario.partyAInvitationMessage);
    }

    const logFilePath = buildLogFilePath();
    await mkdir(path.dirname(logFilePath), { recursive: true });
    const memoriesRoot = resolveObpDemoMemoriesRoot();
    console.log("[demo] log file", logFilePath);
    console.log("[demo] text transcript", textTranscriptPathFromJsonl(logFilePath));
    console.log("[demo] memories SQLite", resolveObpDemoMemoriesDbPath(memoriesRoot));
    console.log(
      "[demo] memories JSONL (Party A persona)",
      jsonlStorePathForNamespace(memoriesRoot, scenario.partyMemoryNamespaces[0]),
    );
    console.log(
      "[demo] memories JSONL (Party B persona)",
      jsonlStorePathForNamespace(memoriesRoot, scenario.partyMemoryNamespaces[1]),
    );
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
