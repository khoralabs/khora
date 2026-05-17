import type { At2UnaryTransport } from "@khoralabs/at2-transport";
import z from "zod";

const zAuthorSubscribeOk = z.object({
  ok: z.literal(true),
  username: z.string(),
  authorDid: z.string(),
});

const zAuthorTopicSubscribeOk = z.object({
  ok: z.literal(true),
  username: z.string(),
  authorDid: z.string(),
  topicSlug: z.string(),
});

const zAuthorsList = z.object({
  authorDids: z.array(z.string()),
  authorTopics: z.array(z.object({ authorDid: z.string(), topicSlug: z.string() })).default([]),
});

export type AuthorSubscriptionsSnapshot = z.infer<typeof zAuthorsList>;

export async function listAuthorSubscriptions(
  t: At2UnaryTransport,
): Promise<AuthorSubscriptionsSnapshot> {
  return t.requestJson("GET", "/v1/authors/subscriptions", { parse: zAuthorsList });
}

export function subscribeAuthor(
  t: At2UnaryTransport,
  username: string,
): Promise<{ ok: true; username: string; authorDid: string }> {
  return t.requestJson("POST", `/v1/authors/${encodeURIComponent(username.trim())}/subscribe`, {
    parse: zAuthorSubscribeOk,
  });
}

export function unsubscribeAuthor(t: At2UnaryTransport, username: string): Promise<void> {
  return t.requestVoid("DELETE", `/v1/authors/${encodeURIComponent(username.trim())}/subscribe`);
}

export function subscribeAuthorTopic(
  t: At2UnaryTransport,
  username: string,
  topicSlug: string,
): Promise<{ ok: true; username: string; authorDid: string; topicSlug: string }> {
  const u = encodeURIComponent(username.trim());
  const s = encodeURIComponent(topicSlug.trim());
  return t.requestJson("POST", `/v1/authors/${u}/topics/${s}/subscribe`, {
    parse: zAuthorTopicSubscribeOk,
  });
}

export function unsubscribeAuthorTopic(
  t: At2UnaryTransport,
  username: string,
  topicSlug: string,
): Promise<void> {
  const u = encodeURIComponent(username.trim());
  const s = encodeURIComponent(topicSlug.trim());
  return t.requestVoid("DELETE", `/v1/authors/${u}/topics/${s}/subscribe`);
}
