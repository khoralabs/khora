import type { KhoraUnaryTransport } from "@khoralabs/khora-transport";
import z from "zod";

const zAuthorsList = z.object({
  authorDids: z.array(z.string()),
  authorTopics: z.array(z.object({ authorDid: z.string(), topicSlug: z.string() })).default([]),
});

export type AuthorSubscriptionsSnapshot = z.infer<typeof zAuthorsList>;

export async function listAuthorSubscriptions(
  t: KhoraUnaryTransport,
): Promise<AuthorSubscriptionsSnapshot> {
  return t.requestJson("GET", "/v1/authors/subscriptions", {
    parse: zAuthorsList,
  });
}
