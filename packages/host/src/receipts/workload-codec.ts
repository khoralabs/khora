import { gunzipSync, gzipSync } from "node:zlib";

export type FanOutWorkloadRecord = {
  ordinal: number;
  subscriptionMatches: readonly unknown[];
};

export const MAX_FAN_OUT_WORKLOAD_RECORDS = 1_000;
export const MAX_FAN_OUT_WORKLOAD_BYTES = 8 * 1024 * 1024;
const MAX_MATCHES_PER_RECORD = 1_000;

function validateRecord(value: unknown): asserts value is FanOutWorkloadRecord {
  const record = value as Partial<FanOutWorkloadRecord> | null;
  if (
    record === null ||
    typeof record !== "object" ||
    !Number.isSafeInteger(record.ordinal) ||
    (record.ordinal ?? -1) < 0 ||
    (record.ordinal ?? 0) > 0xffff_ffff ||
    !Array.isArray(record.subscriptionMatches) ||
    record.subscriptionMatches.length > MAX_MATCHES_PER_RECORD
  ) {
    throw new Error("invalid fan-out workload record");
  }
}

export const FanOutWorkloadCodec = {
  encode(records: readonly FanOutWorkloadRecord[]): Uint8Array {
    if (records.length === 0 || records.length > MAX_FAN_OUT_WORKLOAD_RECORDS) {
      throw new Error(`fan-out workload must contain 1-${MAX_FAN_OUT_WORKLOAD_RECORDS} records`);
    }
    for (const record of records) validateRecord(record);
    const jsonl = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
    if (Buffer.byteLength(jsonl) > MAX_FAN_OUT_WORKLOAD_BYTES) {
      throw new Error("fan-out workload exceeds maximum byte length");
    }
    return new Uint8Array(gzipSync(jsonl));
  },
  decode(bytes: Uint8Array): FanOutWorkloadRecord[] {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FAN_OUT_WORKLOAD_BYTES) {
      throw new Error("invalid fan-out workload compressed byte length");
    }
    const jsonl = gunzipSync(bytes, { maxOutputLength: MAX_FAN_OUT_WORKLOAD_BYTES }).toString(
      "utf8",
    );
    const lines = jsonl.endsWith("\n") ? jsonl.slice(0, -1).split("\n") : jsonl.split("\n");
    if (lines.length === 0 || lines.length > MAX_FAN_OUT_WORKLOAD_RECORDS) {
      throw new Error("invalid fan-out workload record count");
    }
    return lines.map((line) => {
      const record: unknown = JSON.parse(line);
      validateRecord(record);
      return record;
    });
  },
};
