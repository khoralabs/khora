import type { GetMatchmakingScenarioOptions } from "./scenarios/index.ts";

export function parseMatchmakingCliArgs(argv: string[]): {
  scenarioId: string;
  scenarioOptions?: GetMatchmakingScenarioOptions;
} {
  const tail = argv.slice(2);
  let invitationMessage: string | undefined;
  const positionals: string[] = [];

  for (let i = 0; i < tail.length; i++) {
    const a = tail[i];
    if (a === undefined) {
      continue;
    }
    if (a === "--") {
      continue;
    }
    if (a === "--invite" || a === "-i") {
      const next = tail[i + 1];
      if (
        next === undefined ||
        next === "--" ||
        (next.startsWith("-") && !next.startsWith("--invite="))
      ) {
        throw new Error(`${a} requires a message as the next argument`);
      }
      invitationMessage = next;
      i++;
      continue;
    }
    if (a.startsWith("--invite=")) {
      invitationMessage = a.slice("--invite=".length);
      continue;
    }
    if (a.startsWith("-")) {
      throw new Error(`Unknown flag "${a}"`);
    }
    positionals.push(a);
  }

  const scenarioId = positionals[0];
  if (scenarioId === undefined) {
    throw new Error("missing scenario id");
  }

  const trimmed = invitationMessage?.trim();
  const scenarioOptions: GetMatchmakingScenarioOptions | undefined =
    trimmed !== undefined && trimmed.length > 0 ? { invitationMessage: trimmed } : undefined;

  return { scenarioId, scenarioOptions };
}
