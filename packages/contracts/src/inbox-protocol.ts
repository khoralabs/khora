import z from "zod";
import type { KhoraInboxNotification } from "./khora-inbox-notifications";

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

const zHello = z.object({
  type: z.literal("hello"),
  connection_id: z.string().min(1),
});

const zBound = z.object({
  type: z.literal("bound"),
  did: z.string().min(1),
});

const zBindError = z.object({
  type: z.literal("bind_error"),
  did: z.string().optional(),
  error: z.string(),
});

const zSnapshot = z.object({
  type: z.literal("snapshot"),
  did: z.string().min(1),
  notifications: z.array(zInboxRow),
});

const zLive = z.object({
  type: z.literal("notification"),
  did: z.string().min(1),
  id: z.number(),
  notification: z.unknown(),
});

const zDrain = z.object({
  type: z.literal("drain"),
  did: z.string().min(1),
  items: z.array(
    z.object({
      entryKey: z.string(),
      pointer: z.unknown(),
      projection: z.unknown(),
    }),
  ),
});

const zInboxWsPayload = z.discriminatedUnion("type", [
  zHello,
  zBound,
  zBindError,
  zSnapshot,
  zLive,
  zDrain,
]);

export type InboxWsHelloMessage = { type: "hello"; connection_id: string };
export type InboxWsBoundMessage = { type: "bound"; did: string };
export type InboxWsBindErrorMessage = {
  type: "bind_error";
  did?: string;
  error: string;
};

export type InboxWsSnapshotMessage = {
  type: "snapshot";
  did: string;
  notifications: InboxNotificationRow[];
};

export type InboxWsNotificationMessage = {
  type: "notification";
  did: string;
  id: number;
  notification: KhoraInboxNotification;
};

export type InboxWsDrainMessage = {
  type: "drain";
  did: string;
  items: { entryKey: string; pointer: unknown; projection: unknown }[];
};

export type InboxWsServerMessage =
  | InboxWsHelloMessage
  | InboxWsBoundMessage
  | InboxWsBindErrorMessage
  | InboxWsSnapshotMessage
  | InboxWsNotificationMessage
  | InboxWsDrainMessage;

/** Parse a WebSocket text frame from `/v1/inbox/ws`; returns `undefined` if shape is unknown. */
export function parseInboxWebSocketMessage(raw: string): InboxWsServerMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  const r = zInboxWsPayload.safeParse(parsed);
  if (!r.success) return undefined;
  if (r.data.type === "hello") {
    return { type: "hello", connection_id: r.data.connection_id };
  }
  if (r.data.type === "bound") {
    return { type: "bound", did: r.data.did };
  }
  if (r.data.type === "bind_error") {
    return {
      type: "bind_error",
      error: r.data.error,
      ...(r.data.did !== undefined ? { did: r.data.did } : {}),
    };
  }
  if (r.data.type === "snapshot") {
    return {
      type: "snapshot",
      did: r.data.did,
      notifications: r.data.notifications.map((row) => ({
        ...row,
        notification: row.notification as KhoraInboxNotification,
      })),
    };
  }
  if (r.data.type === "notification") {
    return {
      type: "notification",
      did: r.data.did,
      id: r.data.id,
      notification: r.data.notification as KhoraInboxNotification,
    };
  }
  return { type: "drain", did: r.data.did, items: r.data.items };
}

export function helloFrame(connectionId: string): string {
  return JSON.stringify({ type: "hello", connection_id: connectionId });
}

export function boundFrame(did: string): string {
  return JSON.stringify({ type: "bound", did });
}

export function bindErrorFrame(did: string | undefined, error: string): string {
  return JSON.stringify({
    type: "bind_error",
    ...(did !== undefined ? { did } : {}),
    error,
  });
}

export function drainFrame(
  did: string,
  items: { entryKey: string; pointer: unknown; projection: unknown }[],
): string {
  return JSON.stringify({ type: "drain", did, items });
}
