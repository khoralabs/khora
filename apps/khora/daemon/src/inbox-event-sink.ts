import type { KhoraClientEvent } from "@khoralabs/khora-transport";

export type InboxEventSink = {
  onClientEvent(event: KhoraClientEvent): void;
  onLifecycle(msg: string, extra?: Record<string, unknown>): void;
};

export function createInboxEventSink(json: boolean): InboxEventSink {
  if (json) {
    return {
      onClientEvent(event) {
        console.log(JSON.stringify({ ts: Date.now(), event }));
      },
      onLifecycle(msg, extra) {
        console.log(JSON.stringify({ ts: Date.now(), lifecycle: msg, ...extra }));
      },
    };
  }
  return {
    onClientEvent(event) {
      const line = formatHumanEvent(event);
      console.log(line);
    },
    onLifecycle(msg, extra) {
      const bits =
        extra !== undefined
          ? ` ${Object.entries(extra)
              .map(([k, v]) => `${k}=${String(v)}`)
              .join(" ")}`
          : "";
      console.log(`[khora-daemon] ${msg}${bits}`);
    },
  };
}

function formatHumanEvent(event: KhoraClientEvent): string {
  switch (event.type) {
    case "inbox:snapshot":
      return `inbox snapshot: ${event.notifications.length} notification(s)`;
    case "inbox:drain":
      return `inbox drain: ${event.items.length} item(s)`;
    case "inbox:notification":
      return `inbox notification #${event.id}: ${event.notification.kind}`;
    case "inbox:post":
      return `inbox post #${event.id}: postId=${event.notification.payload.postId}`;
    case "inbox:connection_request":
      return `inbox connection_request #${event.id}`;
    case "inbox:host":
      return `inbox host #${event.id}`;
    default:
      return `event: ${event.type}`;
  }
}
