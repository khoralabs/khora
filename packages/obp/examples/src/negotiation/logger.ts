import { appendFileSync, writeFileSync } from "node:fs";
import pino from "pino";

const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();

/** JSONL file logger for a single negotiation run. */
export function createRunLogger(destPath: string): pino.Logger {
  return pino(
    { name: "obp-negotiation-demo", level },
    pino.destination({ dest: destPath, sync: true }),
  );
}

/** Plain-text transcript path paired with a `.jsonl` run log. */
export function textTranscriptPathFromJsonl(jsonlPath: string): string {
  if (jsonlPath.endsWith(".jsonl")) {
    return `${jsonlPath.slice(0, -".jsonl".length)}.text.txt`;
  }
  return `${jsonlPath}.text.txt`;
}

export function initTextTranscript(destPath: string, scenarioTitle: string): void {
  writeFileSync(
    destPath,
    `# ${scenarioTitle}\n# Assistant text only (no OBP tool calls)\n\n`,
    "utf8",
  );
}

/** One turn: optional assistant text blocks (already trimmed per block). */
/** Bootstrap line from Party A before LLM round 0 (see matchmaking `partyAInvitationMessage`). */
export function appendTextTranscriptInvitation(args: {
  destPath: string;
  agentName: string;
  text: string;
}): void {
  const t = args.text.trim();
  if (t.length === 0) {
    return;
  }
  appendFileSync(args.destPath, `[Party A bootstrap] ${args.agentName}:\n${t}\n\n`, "utf8");
}

export function appendTextTranscriptTurn(args: {
  destPath: string;
  round: number;
  agentName: string;
  textBlocks: string[];
}): void {
  const blocks = args.textBlocks.map((t) => t.trim()).filter(Boolean);
  if (blocks.length === 0) {
    return;
  }
  const body = blocks.join("\n\n");
  appendFileSync(args.destPath, `[round ${args.round}] ${args.agentName}:\n${body}\n\n`, "utf8");
}
