import { Buffer } from "node:buffer";

import type { InboxStagingPayload, PointerPayload, WriteOp } from "./colonnade-types";

export function bytesToB64(u: Uint8Array): string {
  return Buffer.from(u).toString("base64");
}

export function b64ToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

export function inboxStagingToJson(s: InboxStagingPayload): string {
  if (s.kind === "inline") {
    return JSON.stringify({
      kind: "inline",
      inline: {
        bytes_b64: bytesToB64(s.inline.bytes),
        content_hash: s.inline.content_hash,
      },
    });
  }
  return JSON.stringify({
    kind: "pointer",
    pointer: {
      pointer: {
        source_cell_id: s.pointer.pointer.source_cell_id,
        source_record_key: s.pointer.pointer.source_record_key,
        content_hash: s.pointer.pointer.content_hash,
        cell_pool_count: s.pointer.pointer.cell_pool_count,
      },
      ...(s.pointer.metadata !== undefined ? { metadata: s.pointer.metadata } : {}),
    },
  });
}

export function inboxStagingFromJson(text: string): InboxStagingPayload {
  const v = JSON.parse(text) as {
    kind?: string;
    inline?: { bytes_b64?: string; content_hash?: string };
    pointer?: {
      pointer?: {
        source_cell_id?: string;
        source_record_key?: string;
        content_hash?: string;
        cell_pool_count?: number;
      };
      metadata?: unknown;
    };
  };
  if (
    v.kind === "inline" &&
    v.inline?.bytes_b64 !== undefined &&
    v.inline.content_hash !== undefined
  ) {
    return {
      kind: "inline",
      inline: {
        bytes: b64ToBytes(v.inline.bytes_b64),
        content_hash: v.inline.content_hash,
      },
    };
  }
  if (
    v.kind === "pointer" &&
    v.pointer?.pointer?.source_cell_id !== undefined &&
    v.pointer.pointer.source_record_key !== undefined &&
    v.pointer.pointer.content_hash !== undefined &&
    typeof v.pointer.pointer.cell_pool_count === "number"
  ) {
    const payload: PointerPayload = {
      pointer: {
        source_cell_id: v.pointer.pointer.source_cell_id,
        source_record_key: v.pointer.pointer.source_record_key,
        content_hash: v.pointer.pointer.content_hash,
        cell_pool_count: v.pointer.pointer.cell_pool_count,
      },
      ...(v.pointer.metadata !== undefined ? { metadata: v.pointer.metadata } : {}),
    };
    return {
      kind: "pointer",
      pointer: payload,
    };
  }
  throw new Error("SqliteColonnade: invalid inbox staging JSON");
}

export function writeOpToJson(op: WriteOp): string {
  if (op.kind === "append_outbox") {
    return JSON.stringify({
      kind: "append_outbox",
      append_outbox: {
        principal_id: op.append_outbox.principal_id,
        record_key: op.append_outbox.record_key,
        payload_bytes_b64: bytesToB64(op.append_outbox.payload_bytes),
        metadata: op.append_outbox.metadata,
      },
    });
  }
  return JSON.stringify({
    kind: "enqueue_inbox",
    enqueue_inbox: {
      target_cell_id: op.enqueue_inbox.target_cell_id,
      recipient_principal_id: op.enqueue_inbox.recipient_principal_id,
      staging_json: inboxStagingToJson(op.enqueue_inbox.staging),
      correlation_id: op.enqueue_inbox.correlation_id,
    },
  });
}

export function writeOpFromJson(text: string): WriteOp {
  const v = JSON.parse(text) as {
    kind?: string;
    append_outbox?: {
      principal_id?: string;
      record_key?: string;
      payload_bytes_b64?: string;
      metadata?: unknown;
    };
    enqueue_inbox?: {
      target_cell_id?: string;
      recipient_principal_id?: string;
      staging_json?: string;
      correlation_id?: string;
    };
  };
  if (
    v.kind === "append_outbox" &&
    v.append_outbox?.principal_id !== undefined &&
    v.append_outbox.record_key !== undefined &&
    v.append_outbox.payload_bytes_b64 !== undefined
  ) {
    return {
      kind: "append_outbox",
      append_outbox: {
        principal_id: v.append_outbox.principal_id,
        record_key: v.append_outbox.record_key,
        payload_bytes: b64ToBytes(v.append_outbox.payload_bytes_b64),
        metadata: v.append_outbox.metadata ?? {},
      },
    };
  }
  if (
    v.kind === "enqueue_inbox" &&
    v.enqueue_inbox?.target_cell_id !== undefined &&
    v.enqueue_inbox.recipient_principal_id !== undefined &&
    v.enqueue_inbox.staging_json !== undefined &&
    v.enqueue_inbox.correlation_id !== undefined
  ) {
    return {
      kind: "enqueue_inbox",
      enqueue_inbox: {
        target_cell_id: v.enqueue_inbox.target_cell_id,
        recipient_principal_id: v.enqueue_inbox.recipient_principal_id,
        staging: inboxStagingFromJson(v.enqueue_inbox.staging_json),
        correlation_id: v.enqueue_inbox.correlation_id,
      },
    };
  }
  throw new Error("SqliteColonnade: invalid write_op JSON");
}
