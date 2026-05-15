import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";
import z from "zod";

const zSubscribeOk = z.object({
  ok: z.literal(true),
  topicSlug: z.string(),
});

const zTopicsList = z.object({
  topicSlugs: z.array(z.string()),
});

export async function listTopicSubscriptions(t: AtriumUnaryTransport): Promise<string[]> {
  const out = await t.requestJson("GET", "/v1/topics", { parse: zTopicsList });
  return out.topicSlugs;
}

export function subscribeTopic(
  t: AtriumUnaryTransport,
  topicSlug: string,
): Promise<{ ok: true; topicSlug: string }> {
  return t.requestJson("POST", `/v1/topics/${encodeURIComponent(topicSlug)}/subscribe`, {
    parse: zSubscribeOk,
  });
}

export function unsubscribeTopic(t: AtriumUnaryTransport, topicSlug: string): Promise<void> {
  return t.requestVoid("DELETE", `/v1/topics/${encodeURIComponent(topicSlug)}/subscribe`);
}
