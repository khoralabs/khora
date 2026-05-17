import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { At2Client } from "./at2-client.ts";
import { createAt2ResolvePath, mergeLabeledAt2PluginLayers } from "./at2-plugins.ts";

describe("createAt2ResolvePath", () => {
  test("joins relative paths under dataDir", () => {
    const r = createAt2ResolvePath("/data");
    expect(r("telemetry")).toBe(resolve("/data", "telemetry"));
  });

  test("passes through absolute paths", () => {
    const r = createAt2ResolvePath("/data");
    expect(r("/tmp/x")).toBe(resolve("/tmp/x"));
  });

  test("passes through :memory:", () => {
    const r = createAt2ResolvePath("/data");
    expect(r(":memory:")).toBe(":memory:");
  });
});

describe("mergeLabeledAt2PluginLayers", () => {
  const a = () => ({ stop: () => {} });
  const b = () => ({ stop: () => {} });
  const c = () => ({ stop: () => {} });

  test("last-wins: later layer replaces same id", () => {
    const merged = mergeLabeledAt2PluginLayers(
      [
        [
          { id: "x", install: a },
          { id: "y", install: b },
        ],
        [{ id: "x", install: c }],
      ],
      "last-wins",
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(c);
    expect(merged[1]).toBe(b);
  });

  test("first-wins: keeps first install per id", () => {
    const merged = mergeLabeledAt2PluginLayers(
      [
        [{ id: "x", install: a }],
        [
          { id: "x", install: c },
          { id: "y", install: b },
        ],
      ],
      "first-wins",
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(a);
    expect(merged[1]).toBe(b);
  });
});

const stubSigner = {
  did: "did:key:test",
  async sign() {
    return new Uint8Array(64);
  },
};

describe("At2Client plugins", () => {
  test("dispose stops plugins in reverse order", () => {
    const stops: number[] = [];
    new At2Client({
      baseUrl: "http://h",
      signer: stubSigner,
      plugins: [
        () => ({
          stop: () => {
            stops.push(1);
          },
        }),
        () => ({
          stop: () => {
            stops.push(2);
          },
        }),
      ],
    }).dispose();
    expect(stops).toEqual([2, 1]);
  });

  test("dispose is idempotent", () => {
    let n = 0;
    const c = new At2Client({
      baseUrl: "http://h",
      signer: stubSigner,
      plugins: [
        () => ({
          stop: () => {
            n++;
          },
        }),
      ],
    });
    c.dispose();
    c.dispose();
    expect(n).toBe(1);
  });
});
