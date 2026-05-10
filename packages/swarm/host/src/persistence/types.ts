/** Stored OBP relay room (ticket HMAC secret + TTL). */
export type ObpRelayRoomRecord = {
  roomId: string;
  pairingSecretHex: string;
  createdAtMs: number;
  expiresAtMs: number;
};

/** One persisted opaque frame for replay / buffering. */
export type ObpRelayFrameRow = {
  id: number;
  bytes: Uint8Array;
};

/**
 * Persistence slice for OBP byte relay rooms (parity with relay `rooms` + `room_messages`).
 * Implementations may use SQLite, in-memory maps, etc.
 */
export interface ObpRelayPersistence {
  upsertRoom(record: ObpRelayRoomRecord): void;
  getPairingSecretIfActive(roomId: string, nowMs: number): string | undefined;
  enqueueFrame(roomId: string, bytes: Uint8Array): number;
  drainFramesAfter(roomId: string, afterId: number): ObpRelayFrameRow[];
  deleteFramesForRoom(roomId: string): void;
}

/** Discriminator for rows in the shared `host_entities` table (matches `source_key` domain prefix). */
export type SwarmHostEntityKind = "profile" | "post" | "topic";

/** Insert/update payload for `host_entities` (`body_json` is canonical JSON). */
export type SwarmHostEntityUpsert = {
  id: string;
  memoryId?: string | null;
  bodyJson: string;
};

/** Row read from host entity tables. */
export type SwarmHostEntityRow = {
  id: string;
  memoryId: string | null;
  bodyJson: string;
  updatedAtMs: number;
};

/** CRUD slice for one host entity table (profile, post, topic). */
export interface SwarmHostEntityPersistence {
  upsert(record: SwarmHostEntityUpsert): void;
  getById(id: string): SwarmHostEntityRow | undefined;
  deleteById(id: string): void;
}

/**
 * Host persistence facade: negotiation relay plus logical entity slices over one `host_entities` table.
 * Add slices (e.g. notifications) without changing call sites that already take this composite.
 */
export type SwarmHostPersistence = {
  obpRelay: ObpRelayPersistence;
  profiles: SwarmHostEntityPersistence;
  posts: SwarmHostEntityPersistence;
  topics: SwarmHostEntityPersistence;
};
