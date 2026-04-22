import { runRfpAward } from "./protocols/rfp.ts";
import { runThreeWayTcp } from "./protocols/tcp.ts";
import { runTwoPhaseCommit, type TwoPcOutcome } from "./protocols/two-pc.ts";
import { createDemoStack } from "./stack.ts";

const PROTOCOLS = ["tcp", "two-pc", "rfp"] as const;
type ProtocolId = (typeof PROTOCOLS)[number];

function printUsage(): void {
  console.error(
    `Usage: bun run src/cli.ts <${PROTOCOLS.join(" | ")}> [two-pc-outcome: commit | abort]`,
  );
}

function parseProtocol(s: string | undefined): ProtocolId | null {
  if (s === undefined) {
    return null;
  }
  if ((PROTOCOLS as readonly string[]).includes(s)) {
    return s as ProtocolId;
  }
  return null;
}

function main(): void {
  const protocol = parseProtocol(process.argv[2]);
  if (protocol === null) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const stack = createDemoStack();
  console.log("OBP handshake demo (programmatic, no LLM)\n");

  switch (protocol) {
    case "tcp":
      runThreeWayTcp(stack);
      break;
    case "two-pc": {
      const raw = process.argv[3]?.toLowerCase();
      const outcome: TwoPcOutcome = raw === "abort" ? "abort" : "commit";
      runTwoPhaseCommit(stack, outcome);
      break;
    }
    case "rfp":
      runRfpAward(stack);
      break;
    default: {
      const _exhaustive: never = protocol;
      void _exhaustive;
    }
  }

  console.log("\nDone.");
}

main();
