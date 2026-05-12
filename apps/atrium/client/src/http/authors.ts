import z from "zod";
import type { HttpTransport } from "./transport.ts";

const zAuthorSubscribeOk = z.object({
  ok: z.literal(true),
  username: z.string(),
  authorDid: z.string(),
});

const zAuthorsList = z.object({
  authorDids: z.array(z.string()),
});

export async function listAuthorSubscriptions(t: HttpTransport): Promise<string[]> {
  const out = await t.requestJson("GET", "/v1/authors/subscriptions", { parse: zAuthorsList });
  return out.authorDids;
}

export function subscribeAuthor(
  t: HttpTransport,
  username: string,
): Promise<{ ok: true; username: string; authorDid: string }> {
  return t.requestJson("POST", `/v1/authors/${encodeURIComponent(username.trim())}/subscribe`, {
    parse: zAuthorSubscribeOk,
  });
}

export function unsubscribeAuthor(t: HttpTransport, username: string): Promise<void> {
  return t.requestVoid("DELETE", `/v1/authors/${encodeURIComponent(username.trim())}/subscribe`);
}
