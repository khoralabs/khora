import { describe, expect, test } from "bun:test";
import type { Offer, Port } from "../model/types";
import { validateBindPreconditions } from "./bind";

const offer = (o: Partial<Offer> & Pick<Offer, "id">): Offer => ({
  created_seq: 0,
  expires_seq: 1000,
  type: "t",
  sourcemaps: [],
  ...o,
});

const port = (p: Partial<Port> & Pick<Port, "id" | "ref" | "max_bindings">): Port => ({
  created_seq: 0,
  expires_seq: 1000,
  type: "t",
  promise: "test port",
  terminal: false,
  sourcemaps: [],
  ...p,
});

describe("validateBindPreconditions", () => {
  test("rejects expired offer", () => {
    const pRow = port({ id: "p", ref: "", max_bindings: 5 });
    const ports = new Map<string, Port>([["p", pRow]]);
    const f = validateBindPreconditions({
      ledgerSeq: 1000,
      offer: offer({ id: "o", expires_seq: 1000 }),
      port: pRow,
      portsById: ports,
      targetPortIsExposed: true,
      binds: [],
    });
    expect(f?.code).toBe("EXPIRED");
  });

  test("rejects not exposed", () => {
    const pRow = port({ id: "p", ref: "", max_bindings: 5 });
    const ports = new Map<string, Port>([["p", pRow]]);
    const f = validateBindPreconditions({
      ledgerSeq: 0,
      offer: offer({ id: "o", expires_seq: 1000 }),
      port: pRow,
      portsById: ports,
      targetPortIsExposed: false,
      binds: [],
    });
    expect(f?.code).toBe("NOT_EXPOSED");
  });

  test("rejects when max_bindings reached", () => {
    const pRow = port({ id: "p", ref: "", max_bindings: 1 });
    const ports = new Map<string, Port>([["p", pRow]]);
    const f = validateBindPreconditions({
      ledgerSeq: 0,
      offer: offer({ id: "o", expires_seq: 1000 }),
      port: pRow,
      portsById: ports,
      targetPortIsExposed: true,
      binds: [{ offerId: "o1", portId: "p" }],
    });
    expect(f?.code).toBe("MAX_BINDINGS");
  });

  test("allows when under max_bindings", () => {
    const pRow = port({ id: "p", ref: "", max_bindings: 2 });
    const ports = new Map<string, Port>([["p", pRow]]);
    const f = validateBindPreconditions({
      ledgerSeq: 0,
      offer: offer({ id: "o", expires_seq: 1000 }),
      port: pRow,
      portsById: ports,
      targetPortIsExposed: true,
      binds: [{ offerId: "o1", portId: "p" }],
    });
    expect(f).toBeNull();
  });
});
