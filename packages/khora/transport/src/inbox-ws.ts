import type { KhoraInboxNotification } from "@khoralabs/khora-contracts";
import z from "zod";

const zInboxRow = z.object({
  id: z.number(),
  createdAtMs: z.number(),
  read: z.boolean(),
  notification: z.unknown(),
});

export type InboxNotificationRow = {
  id: number;
  createdAtMs: number;
  read: boolean;
  notification: KhoraInboxNotification;
};

const zSnapshot = z.object({
  type: z.literal("snapshot"),
  notifications: z.array(zInboxRow),
});

const zLive = z.object({
  type: z.literal("notification"),
  id: z.number(),
  notification: z.unknown(),
});

const zDrain = z.object({
  type: z.literal("drain"),
  items: z.array(
    z.object({
      entryKey: z.string(),
      pointer: z.unknown(),
      projection: z.unknown(),
    }),
  ),
});

const zInboxWsPayload = z.discriminatedUnion("type", [zSnapshot, zLive, zDrain]);

export type InboxWsSnapshotMessage = {
  type: "snapshot";
  notifications: InboxNotificationRow[];
};

export type InboxWsNotificationMessage = {
  type: "notification";
  id: number;
  notification: KhoraInboxNotification;
};

export type InboxWsDrainMessage = {
  type: "drain";
  items: { entryKey: string; pointer: unknown; projection: unknown }[];
};

/** Parse a WebSocket text frame from `/v1/inbox/ws`; returns `undefined` if shape is unknown. */
export function parseInboxWebSocketMessage(
  raw: string,
): InboxWsSnapshotMessage | InboxWsNotificationMessage | InboxWsDrainMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  const r = zInboxWsPayload.safeParse(parsed);
  if (!r.success) return undefined;
  if (r.data.type === "snapshot") {
    return {
      type: "snapshot",
      notifications: r.data.notifications.map((row) => ({
        ...row,
        notification: row.notification as KhoraInboxNotification,
      })),
    };
  }
  if (r.data.type === "notification") {
    return {
      type: "notification",
      id: r.data.id,
      notification: r.data.notification as KhoraInboxNotification,
    };
  }
  return { type: "drain", items: r.data.items };
}

/** Build inbox WebSocket URL with `did` query (matches Khora host). */
export function inboxWebSocketUrl(baseUrl: string, did: string): string {
  const root = new URL(baseUrl.trim().replace(/\/$/, ""));
  const ws = new URL("/v1/inbox/ws", root);
  ws.protocol = root.protocol === "https:" ? "wss:" : "ws:";
  ws.searchParams.set("did", did);
  return ws.toString();
}
