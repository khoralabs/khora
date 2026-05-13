import type { CommandHelp } from "./types.ts";

export const subscriptionsListHelp: CommandHelp = {
  command: "subscriptions list",
  summary: "List topic and/or author subscriptions.",
  args: `atrium subscriptions list
  JSON: { "topics": string[], "authors": { authorDids, authorTopics } }.

atrium subscriptions list topic
  Topic slugs only (same as legacy topic list).

atrium subscriptions list author
  Full author subscription snapshot (authorDids + authorTopics).

atrium subscriptions list author-topic
  Only author+topic pairs: [{ authorDid, topicSlug }, …].`,
};

export const subscriptionsCreateHelp: CommandHelp = {
  command: "subscriptions create",
  summary: "Create a subscription (topic, author, or author+topic).",
  wizard: `atrium subscriptions create topic
  Interactive OBP flow to pick a topic slug, then subscribe.`,
  args: `atrium subscriptions create topic [<slug>]
  With slug: subscribe to that topic. Without: interactive wizard.

atrium subscriptions create author <username>
  POST /v1/authors/<username>/subscribe.

atrium subscriptions create author-topic <username> <topic-slug>
  POST /v1/authors/<username>/topics/<slug>/subscribe.`,
};

export const subscriptionsDeleteHelp: CommandHelp = {
  command: "subscriptions delete",
  summary: "Remove a subscription (topic, author, or author+topic).",
  wizard: `atrium subscriptions delete topic
  Interactive flow to pick a subscribed topic to remove.`,
  args: `atrium subscriptions delete topic [<slug>]
  With slug: unsubscribe. Without: interactive wizard.

atrium subscriptions delete author <username>
  DELETE /v1/authors/<username>/subscribe.

atrium subscriptions delete author-topic <username> <topic-slug>
  DELETE /v1/authors/<username>/topics/<slug>/subscribe.`,
};
