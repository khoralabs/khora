import type { AgentDid } from "./types.ts";

export type AgentNotification =
  | { kind: "connection_request"; payload: unknown }
  | { kind: "host"; payload: unknown };

/** Host-side queue for agents identified by DID (e.g. offline delivery). */
export interface AgentNotificationBufferPort {
  /** Idempotent registration slot for notification delivery. */
  ensureRegistered(did: AgentDid): Promise<void>;

  enqueue(did: AgentDid, note: AgentNotification): Promise<void>;

  dequeueBatch(did: AgentDid, limit?: number): Promise<AgentNotification[]>;
}
