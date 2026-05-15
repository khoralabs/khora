import type { AgentNotification } from "@khoralabs/agent-relay";
import type { AtriumUnaryTransport, InboxNotificationRow } from "@khoralabs/atrium-transport";
import z from "zod";

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
  t: AtriumUnaryTransport,
  params: ListInboxParams = {},
): Promise<InboxListResult> {
  const query: Record<string, string> = {};
  if (params.limit !== undefined) query.limit = String(params.limit);
  if (params.markRead === true) query.markRead = "1";
  const data = await t.requestJson("GET", "/v1/inbox", {
    parse: zInboxListResponse,
    query,
    signedQueryKeys: ["limit", "markRead"],
  });
  return {
    notifications: data.notifications.map((row) => ({
      ...row,
      notification: row.notification as AgentNotification,
    })),
  };
}
