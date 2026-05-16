import type { InboxStagingPayload, WriteOp } from "../colonnade-types.ts";
import { assertContentHash, contentHashBytesToHex, contentHashHexToBytes } from "../hash.ts";
import { inboxStagingFromJson, writeOpFromJson } from "./staging-json.ts";

const MAGIC_STAGING = 0xc1;
const MAGIC_WRITE_OP = 0xc2;

const KIND_INLINE = 1;
const KIND_POINTER = 2;
const WO_APPEND_OUTBOX = 1;
const WO_ENQUEUE_INBOX = 2;

const enc = new TextEncoder();

function utf8(s: string): Uint8Array {
  return enc.encode(s);
}

function readUtf8(buf: Uint8Array, off: number, len: number): { s: string; next: number } {
  const slice = buf.subarray(off, off + len);
  return { s: new TextDecoder().decode(slice), next: off + len };
}

export function inboxStagingToBlob(s: InboxStagingPayload): Uint8Array {
  if (s.kind === "inline") {
    const pl = s.inline.bytes.byteLength;
    const hashB = contentHashHexToBytes(s.inline.content_hash);
    const out = new Uint8Array(2 + 4 + pl + 32);
    const dv = new DataView(out.buffer);
    out[0] = MAGIC_STAGING;
    out[1] = KIND_INLINE;
    dv.setUint32(2, pl, true);
    out.set(s.inline.bytes, 6);
    out.set(hashB, 6 + pl);
    return out;
  }
  const p = s.pointer.pointer;
  const cellId = utf8(p.source_cell_id);
  const rk = utf8(p.source_record_key);
  const hashB = contentHashHexToBytes(p.content_hash);
  const out = new Uint8Array(2 + 2 + cellId.byteLength + 2 + rk.byteLength + 32);
  const dv = new DataView(out.buffer);
  let o = 0;
  out[o++] = MAGIC_STAGING;
  out[o++] = KIND_POINTER;
  dv.setUint16(o, cellId.byteLength, true);
  o += 2;
  out.set(cellId, o);
  o += cellId.byteLength;
  dv.setUint16(o, rk.byteLength, true);
  o += 2;
  out.set(rk, o);
  o += rk.byteLength;
  out.set(hashB, o);
  return out;
}

export function inboxStagingFromBlob(buf: Uint8Array): InboxStagingPayload {
  if (buf.byteLength < 2 || buf[0] !== MAGIC_STAGING) {
    return inboxStagingFromJson(new TextDecoder().decode(buf));
  }
  const kind = buf[1];
  if (kind === KIND_INLINE) {
    if (buf.byteLength < 2 + 4 + 32) throw new Error("SqliteColonnade: truncated inline staging blob");
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const pl = dv.getUint32(2, true);
    const end = 6 + pl + 32;
    if (buf.byteLength < end) throw new Error("SqliteColonnade: truncated inline staging blob");
    const bytes = buf.slice(6, 6 + pl);
    const hashB = buf.subarray(6 + pl, end);
    const content_hash = contentHashBytesToHex(hashB);
    assertContentHash(content_hash);
    return { kind: "inline", inline: { bytes, content_hash } };
  }
  if (kind === KIND_POINTER) {
    if (buf.byteLength < 2 + 2 + 2 + 32) throw new Error("SqliteColonnade: truncated pointer staging blob");
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let o = 2;
    const cellLen = dv.getUint16(o, true);
    o += 2;
    const { s: source_cell_id, next: o2 } = readUtf8(buf, o, cellLen);
    o = o2;
    const rkLen = dv.getUint16(o, true);
    o += 2;
    const { s: source_record_key, next: o3 } = readUtf8(buf, o, rkLen);
    o = o3;
    if (buf.byteLength < o + 32) throw new Error("SqliteColonnade: truncated pointer staging blob");
    const content_hash = contentHashBytesToHex(buf.subarray(o, o + 32));
    assertContentHash(content_hash);
    return {
      kind: "pointer",
      pointer: { pointer: { source_cell_id, source_record_key, content_hash } },
    };
  }
  throw new Error("SqliteColonnade: unknown inbox staging blob kind");
}

export function writeOpToBlob(op: WriteOp): Uint8Array {
  if (op.kind === "append_outbox") {
    const a = op.append_outbox;
    const pid = utf8(a.principal_id);
    const rk = utf8(a.record_key);
    const metaJson = utf8(JSON.stringify(a.metadata));
    const pb = a.payload_bytes;
    const pl = pb.byteLength;
    const out = new Uint8Array(2 + 2 + pid.byteLength + 2 + rk.byteLength + 4 + pl + 4 + metaJson.byteLength);
    const dv = new DataView(out.buffer);
    let o = 0;
    out[o++] = MAGIC_WRITE_OP;
    out[o++] = WO_APPEND_OUTBOX;
    dv.setUint16(o, pid.byteLength, true);
    o += 2;
    out.set(pid, o);
    o += pid.byteLength;
    dv.setUint16(o, rk.byteLength, true);
    o += 2;
    out.set(rk, o);
    o += rk.byteLength;
    dv.setUint32(o, pl, true);
    o += 4;
    out.set(pb, o);
    o += pl;
    dv.setUint32(o, metaJson.byteLength, true);
    o += 4;
    out.set(metaJson, o);
    return out;
  }
  const e = op.enqueue_inbox;
  const tc = utf8(e.target_cell_id);
  const rp = utf8(e.recipient_principal_id);
  const stagingBlob = inboxStagingToBlob(e.staging);
  const corr = utf8(e.correlation_id);
  const out = new Uint8Array(
    2 + 2 + tc.byteLength + 2 + rp.byteLength + 4 + stagingBlob.byteLength + 2 + corr.byteLength,
  );
  const dv = new DataView(out.buffer);
  let o = 0;
  out[o++] = MAGIC_WRITE_OP;
  out[o++] = WO_ENQUEUE_INBOX;
  dv.setUint16(o, tc.byteLength, true);
  o += 2;
  out.set(tc, o);
  o += tc.byteLength;
  dv.setUint16(o, rp.byteLength, true);
  o += 2;
  out.set(rp, o);
  o += rp.byteLength;
  dv.setUint32(o, stagingBlob.byteLength, true);
  o += 4;
  out.set(stagingBlob, o);
  o += stagingBlob.byteLength;
  dv.setUint16(o, corr.byteLength, true);
  o += 2;
  out.set(corr, o);
  return out;
}

export function writeOpFromBlob(buf: Uint8Array): WriteOp {
  if (buf.byteLength < 2 || buf[0] !== MAGIC_WRITE_OP) {
    return writeOpFromJson(new TextDecoder().decode(buf));
  }
  const kind = buf[1];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (kind === WO_APPEND_OUTBOX) {
    let o = 2;
    const pidLen = dv.getUint16(o, true);
    o += 2;
    const { s: principal_id, next: o2 } = readUtf8(buf, o, pidLen);
    o = o2;
    const rkLen = dv.getUint16(o, true);
    o += 2;
    const { s: record_key, next: o3 } = readUtf8(buf, o, rkLen);
    o = o3;
    const pl = dv.getUint32(o, true);
    o += 4;
    if (buf.byteLength < o + pl + 4) throw new Error("SqliteColonnade: truncated append_outbox blob");
    const payload_bytes = buf.slice(o, o + pl);
    o += pl;
    const ml = dv.getUint32(o, true);
    o += 4;
    if (buf.byteLength < o + ml) throw new Error("SqliteColonnade: truncated append_outbox metadata");
    const { s: metaStr } = readUtf8(buf, o, ml);
    let metadata: unknown = {};
    try {
      metadata = JSON.parse(metaStr) as unknown;
    } catch {
      metadata = {};
    }
    return {
      kind: "append_outbox",
      append_outbox: {
        principal_id,
        record_key,
        payload_bytes,
        metadata: metadata as Record<string, unknown>,
      },
    };
  }
  if (kind === WO_ENQUEUE_INBOX) {
    let o = 2;
    const tcLen = dv.getUint16(o, true);
    o += 2;
    const { s: target_cell_id, next: o2 } = readUtf8(buf, o, tcLen);
    o = o2;
    const rpLen = dv.getUint16(o, true);
    o += 2;
    const { s: recipient_principal_id, next: o3 } = readUtf8(buf, o, rpLen);
    o = o3;
    const sl = dv.getUint32(o, true);
    o += 4;
    if (buf.byteLength < o + sl + 2) throw new Error("SqliteColonnade: truncated enqueue_inbox blob");
    const staging = inboxStagingFromBlob(buf.subarray(o, o + sl));
    o += sl;
    const cl = dv.getUint16(o, true);
    o += 2;
    if (buf.byteLength < o + cl) throw new Error("SqliteColonnade: truncated enqueue_inbox correlation");
    const { s: correlation_id } = readUtf8(buf, o, cl);
    return {
      kind: "enqueue_inbox",
      enqueue_inbox: {
        target_cell_id,
        recipient_principal_id,
        staging,
        correlation_id,
      },
    };
  }
  throw new Error("SqliteColonnade: unknown write_op blob kind");
}
