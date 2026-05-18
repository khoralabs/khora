import type { AtriumUnaryTransport } from "@khoralabs/at2-transport";
import z from "zod";

const zSubscribeOk = z.object({
  ok: z.literal(true),
  topicSlug: z.string(),
});

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
