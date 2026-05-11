import z from "zod";
import type { HttpTransport } from "./transport.ts";

const zSubscribeOk = z.object({
  ok: z.literal(true),
  topicSlug: z.string(),
});

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
