import type { AgentNotification } from "@khoralabs/swarm-host";
import z from "zod";
import type { InboxNotificationRow } from "../inbox-ws.ts";
import type { HttpTransport } from "./transport.ts";

const zInboxListResponse = z.object({
  notifications: z.array(
    z.object({
      id: z.number(),
      createdAtMs: z.number(),
      read: z.boolean(),
      notification: z.unknown(),
    }),
  ),
});

export type ListInboxParams = {
  limit?: number;
  markRead?: boolean;
};

export type InboxListResult = {
  notifications: InboxNotificationRow[];
};

export async function listInbox(
  t: HttpTransport,
  params: ListInboxParams = {},
): Promise<InboxListResult> {
  const q = new URLSearchParams();
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.markRead === true) q.set("markRead", "1");
  const qs = q.toString();
  const path = qs.length > 0 ? `/v1/inbox?${qs}` : "/v1/inbox";
  const data = await t.requestJson("GET", path, { parse: zInboxListResponse });
  return {
    notifications: data.notifications.map((row) => ({
      ...row,
      notification: row.notification as AgentNotification,
    })),
  };
}
