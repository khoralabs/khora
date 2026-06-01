import type { CommandHelp } from "@khoralabs/cli-kit";

export const subscriptionsListHelp: CommandHelp = {
  command: "subscriptions list",
  summary: "List your standing-search subscriptions",
  args: `khora subscriptions list [--json]`,
  wizard: `Shows one AND predicate per subscription (topic, author, query).`,
};

export const subscriptionsCreateHelp: CommandHelp = {
  command: "subscriptions create",
  summary: "Create a standing-search subscription (AND predicate)",
  wizard: `Prompts: optional topic slug, author (DID or username), semantic query (at least one required), optional body note, min score, visibility`,
  args: `khora subscriptions create [--topic=<slug>] [--author=<did|username>] [--query=<text>] [--body=…] [--min-score=N] [--visibility=public|network|private] [--namespace-root=global]`,
};
