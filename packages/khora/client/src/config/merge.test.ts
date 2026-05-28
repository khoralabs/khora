import { describe, expect, test } from "bun:test";
import { ATRIUM_BUILTIN_PLUGIN_ID } from "../khora-plugins.ts";
import { mergeKhoraAppConfigLayers } from "./merge.ts";

describe("mergeKhoraAppConfigLayers", () => {
  test("scalar last-wins on defined values", () => {
    const merged = mergeKhoraAppConfigLayers([
      { baseUrl: "http://a", dataDir: "/d" },
      { baseUrl: "http://b" },
    ]);
    expect(merged).toEqual({ baseUrl: "http://b", dataDir: "/d" });
  });

  test("undefined values do not overwrite earlier defined", () => {
    const merged = mergeKhoraAppConfigLayers([{ baseUrl: "http://a" }, { baseUrl: undefined }]);
    expect(merged).toEqual({ baseUrl: "http://a" });
  });

  test("plugins map: per-id last-wins", () => {
    const merged = mergeKhoraAppConfigLayers([
      {
        plugins: {
          [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "a.json" },
          [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t1" },
        },
      },
      {
        plugins: {
          [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "b.json" },
        },
      },
    ]);
    expect(merged.plugins).toEqual({
      [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "b.json" },
      [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t1" },
    });
  });

  test("plugins map: false cancels prior entry for the same id", () => {
    const merged = mergeKhoraAppConfigLayers([
      {
        plugins: {
          [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "a.json" },
          [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t1" },
        },
      },
      { plugins: { [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: false } },
    ]);
    expect(merged.plugins).toEqual({
      [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t1" },
    });
  });

  test("preserves cross-host plugin entries (shared file)", () => {
    const merged = mergeKhoraAppConfigLayers([
      {
        plugins: {
          [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
          [ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: "b.sqlite" },
        },
      },
    ]);
    expect(merged.plugins).toEqual({
      [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
      [ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: "b.sqlite" },
    });
  });

  test("ignores non-object layers", () => {
    const merged = mergeKhoraAppConfigLayers([null, undefined, "x", { baseUrl: "http://a" }]);
    expect(merged).toEqual({ baseUrl: "http://a" });
  });
});
