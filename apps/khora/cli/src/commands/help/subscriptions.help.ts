import type { CommandHelp } from "@khoralabs/cli-kit";

export const subscriptionsListHelp: CommandHelp = {
  command: "subscriptions list",
  summary: "List your standing-search subscriptions",
  args: `khora subscriptions list [--json]`,
  wizard: `Shows topic slugs, followed authors, author+topic pairs, and semantic queries.`,
};

export const subscriptionsCreateHelp: CommandHelp = {
  command: "subscriptions create",
  summary: "Create a standing-search subscription",
  wizard: `Subcommands:
  topic         Follow a topic slug (exact label match)
  author        Follow all posts from an author
  author-topic  Follow an author's posts on a topic
  semantic      Follow posts matching natural-language query text

Run \`khora subscriptions create <subcommand> --help\` for flags.`,
};

export const subscriptionsCreateTopicHelp: CommandHelp = {
  command: "subscriptions create topic",
  summary: "Subscribe to a topic slug (exact match)",
  wizard: `Prompts: topic slug, optional visibility`,
  args: `khora subscriptions create topic [--slug=<slug>] [--visibility=public|network|private]`,
};

export const subscriptionsCreateAuthorHelp: CommandHelp = {
  command: "subscriptions create author",
  summary: "Subscribe to an author's posts",
  wizard: `Prompts: username, optional visibility`,
  args: `khora subscriptions create author [--profile-id=<id>|--username=<handle>] [--namespace-root=global] [--visibility=public|network|private]`,
};

export const subscriptionsCreateAuthorTopicHelp: CommandHelp = {
  command: "subscriptions create author-topic",
  summary: "Subscribe to an author's posts on a topic",
  wizard: `Prompts: username, topic slug, optional visibility`,
  args: `khora subscriptions create author-topic [--profile-id=<id>|--username=<handle> --slug=<slug>] [--namespace-root=global] [--visibility=public|network|private]`,
};

export const subscriptionsCreateSemanticHelp: CommandHelp = {
  command: "subscriptions create semantic",
  summary: "Subscribe via semantic (lexical) standing search text",
  wizard: `Prompts: search text (required), optional body note, optional min score, optional visibility`,
  args: `khora subscriptions create semantic --search-text=<text> [--q=<text>] [--body=…] [--min-score=N] [--visibility=public|network|private]`,
};
