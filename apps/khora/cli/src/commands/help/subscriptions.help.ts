import type { CommandHelp } from "@khoralabs/cli-kit";

export const subscriptionsListHelp: CommandHelp = {
  command: "subscriptions list",
  summary: "List author and topic subscriptions",
  args: `khora subscriptions list [--json]`,
};

export const subscriptionsCreateTopicHelp: CommandHelp = {
  command: "subscriptions create topic",
  summary: "Subscribe to a topic slug",
  args: `khora subscriptions create topic --slug=<slug> --title=… --body=… [--visibility=public]`,
};

export const subscriptionsCreateAuthorHelp: CommandHelp = {
  command: "subscriptions create author",
  summary: "Subscribe to an author's posts",
  args: `khora subscriptions create author --profile-id=<id>|--username=<handle> --title=… --body=… [--namespace-root=global]`,
};

export const subscriptionsCreateAuthorTopicHelp: CommandHelp = {
  command: "subscriptions create author-topic",
  summary: "Subscribe to an author's posts on a topic",
  args: `khora subscriptions create author-topic --profile-id=<id>|--username=<handle> --slug=<slug> --title=… --body=…`,
};
