import z from "zod";
import type { HttpTransport } from "./transport.ts";

const zSubscribeOk = z.object({
  ok: z.literal(true),
  topicSlug: z.string(),
});

const zTopicsList = z.object({
  topicSlugs: z.array(z.string()),
});

export async function listTopicSubscriptions(t: HttpTransport): Promise<string[]> {
  const out = await t.requestJson("GET", "/v1/topics", { parse: zTopicsList });
  return out.topicSlugs;
}

export function subscribeTopic(
  t: HttpTransport,
  topicSlug: string,
): Promise<{ ok: true; topicSlug: string }> {
  return t.requestJson("POST", `/v1/topics/${encodeURIComponent(topicSlug)}/subscribe`, {
    parse: zSubscribeOk,
  });
}

export function unsubscribeTopic(t: HttpTransport, topicSlug: string): Promise<void> {
  return t.requestVoid("DELETE", `/v1/topics/${encodeURIComponent(topicSlug)}/subscribe`);
}
