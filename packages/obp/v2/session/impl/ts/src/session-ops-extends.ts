/**
 * Merkle “extends” check for multiplex **`session_envelope`** sync, using the same tree as
 * {@link checkpointForSessionOps} (v2 **`khora.obp.session`** rules).
 */

import { ObpError } from "@khoralabs/obp-v2-errors";
import { checkpointForSessionOps } from "./session-merkle.ts";
import type { JsonDocument, SessionOp } from "./session-protocol-types.ts";
import {
  isSha256HexLower,
  type Sha256HexLower,
  toSha256HexLower,
} from "./session-protocol-types.ts";

/** Wire JSON checkpoint (`seq` is small enough for **`Number`** after JSON parse). */
export type SessionCheckpointWire = {
  seq: number;
  root_hex: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseSessionOpUnknown(v: unknown, index: number): SessionOp {
  if (!isRecord(v)) {
    throw new ObpError("VALIDATION", `session_envelope.delta_ops[${index}]: expected object`);
  }
  const kind = v.kind;
  if (typeof kind !== "string") {
    throw new ObpError("VALIDATION", `session_envelope.delta_ops[${index}].kind: expected string`);
  }
  const session_id = typeof v.session_id === "string" ? v.session_id : "";
  const payload = (v.payload ?? null) as JsonDocument;
  return { kind, payload, session_id };
}

/** {@link checkpointForSessionOps} with **`seq`** as JSON-safe **`number`**. */
export function checkpointWireFromSessionOps(ops: readonly SessionOp[]): SessionCheckpointWire {
  const cp = checkpointForSessionOps(ops);
  if (cp.seq > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ObpError("VALIDATION", "session op log too long for wire checkpoint seq");
  }
  return { seq: Number(cp.seq), root_hex: cp.root_hex };
}

export function verifySessionOpsExtends(args: {
  baseOps: readonly SessionOp[];
  deltaOps: readonly unknown[];
  claimed: SessionCheckpointWire;
}):
  | { ok: true; checkpoint: SessionCheckpointWire }
  | { ok: false; error: { code: "SEQ_MISMATCH" | "ROOT_MISMATCH" } } {
  const deltaParsed: SessionOp[] = args.deltaOps.map((d, i) => parseSessionOpUnknown(d, i));
  const full = [...args.baseOps, ...deltaParsed];
  if (full.length !== args.claimed.seq) {
    return { ok: false, error: { code: "SEQ_MISMATCH" } };
  }
  const cp = checkpointForSessionOps(full);
  const claimedRoot = isSha256HexLower(args.claimed.root_hex)
    ? (args.claimed.root_hex as Sha256HexLower)
    : toSha256HexLower(args.claimed.root_hex);
  if (cp.root_hex !== claimedRoot) {
    return { ok: false, error: { code: "ROOT_MISMATCH" } };
  }
  return { ok: true, checkpoint: checkpointWireFromSessionOps(full) };
}
