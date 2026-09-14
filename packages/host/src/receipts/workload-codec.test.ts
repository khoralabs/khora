import { expect, test } from "bun:test";
import {
  FanOutWorkloadCodec,
  type FanOutWorkloadRecord,
  MAX_FAN_OUT_WORKLOAD_RECORDS,
} from "./workload-codec";

test("workload codec round-trips gzip JSONL records", () => {
  const records: FanOutWorkloadRecord[] = [
    { ordinal: 7, subscriptionMatches: ["author", { topic: "typescript" }] },
    { ordinal: 65_537, subscriptionMatches: [] },
  ];
  const encoded = FanOutWorkloadCodec.encode(records);
  expect([...encoded.slice(0, 2)]).toEqual([0x1f, 0x8b]);
  expect(FanOutWorkloadCodec.decode(encoded)).toEqual(records);
});

test("workload codec validates bounded records", () => {
  expect(() => FanOutWorkloadCodec.encode([])).toThrow();
  expect(() =>
    FanOutWorkloadCodec.encode(
      Array.from({ length: MAX_FAN_OUT_WORKLOAD_RECORDS + 1 }, (_, ordinal) => ({
        ordinal,
        subscriptionMatches: [],
      })),
    ),
  ).toThrow();
  expect(() => FanOutWorkloadCodec.encode([{ ordinal: -1, subscriptionMatches: [] }])).toThrow();
  expect(() => FanOutWorkloadCodec.decode(new Uint8Array([1]))).toThrow();
});
