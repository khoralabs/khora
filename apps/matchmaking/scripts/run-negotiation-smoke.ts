import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runMatchmakingSession } from "../src/lib/llm/session.ts";
import {
  resolveObpDatabasePath,
  resolveObpStepsJsonlPath,
  textTranscriptPathFromJsonl,
} from "../src/lib/matchmaking-obp/index.ts";
import {
  jsonlStorePathForNamespace,
  resolveMemoriesDbPath,
  resolveMemoriesRoot,
} from "../src/lib/memories/persisted-memories.ts";
import { buildIntroRequestScenarioPair } from "../src/lib/scenarios/intro-request.ts";

function buildLogFilePath(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = path.join(process.cwd(), ".obp-demo-logs");
  return path.join(logDir, `negotiation_smoke_${ts}.jsonl`);
}

async function main(): Promise<void> {
  const scenario = await buildIntroRequestScenarioPair("p1", "p2", {
    invitationMessage: "Smoke run: opening line from Party A.",
  });

  const logFilePath = buildLogFilePath();
  await mkdir(path.dirname(logFilePath), { recursive: true });
  const memoriesRoot = resolveMemoriesRoot();
  console.log("[negotiation-smoke] log file", logFilePath);
  console.log("[negotiation-smoke] text transcript", textTranscriptPathFromJsonl(logFilePath));
  console.log("[negotiation-smoke] memories SQLite", resolveMemoriesDbPath(memoriesRoot));
  console.log(
    "[negotiation-smoke] memories JSONL (Party A)",
    jsonlStorePathForNamespace(memoriesRoot, scenario.partyMemoryNamespaces[0]),
  );
  console.log(
    "[negotiation-smoke] memories JSONL (Party B)",
    jsonlStorePathForNamespace(memoriesRoot, scenario.partyMemoryNamespaces[1]),
  );

  const runId = crypto.randomUUID();
  console.log("[negotiation-smoke] OBP SQLite", resolveObpDatabasePath(runId));
  console.log("[negotiation-smoke] OBP steps JSONL", resolveObpStepsJsonlPath(runId));

  const result = await runMatchmakingSession({ scenario, logFilePath, runId });
  console.log("\n[result]", result);
  if (result.status === "error") {
    process.exitCode = 1;
  }
}

await main();
