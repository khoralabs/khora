import { describe, expect, test } from "bun:test";
import { AT2_BUILTIN_PLUGIN_ID } from "../at2-plugins.ts";
import { mergeAt2AppConfigLayers } from "./merge.ts";

describe("mergeAt2AppConfigLayers", () => {
  test("scalar last-wins on defined values", () => {
    const merged = mergeAt2AppConfigLayers([
      { baseUrl: "http://a", dataDir: "/d" },
      { baseUrl: "http://b" },
    ]);
    expect(merged).toEqual({ baseUrl: "http://b", dataDir: "/d" });
  });

  test("undefined values do not overwrite earlier defined", () => {
    const merged = mergeAt2AppConfigLayers([{ baseUrl: "http://a" }, { baseUrl: undefined }]);
    expect(merged).toEqual({ baseUrl: "http://a" });
  });

  test("plugins map: per-id last-wins", () => {
    const merged = mergeAt2AppConfigLayers([
      {
        plugins: {
          [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "a.json" },
          [AT2_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t1" },
        },
      },
      {
        plugins: { [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "b.json" } },
      },
    ]);
    expect(merged.plugins).toEqual({
      [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "b.json" },
      [AT2_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t1" },
    });
  });

  test("plugins map: false cancels prior entry for the same id", () => {
    const merged = mergeAt2AppConfigLayers([
      {
        plugins: {
          [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "a.json" },
          [AT2_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t1" },
        },
      },
      { plugins: { [AT2_BUILTIN_PLUGIN_ID.profileSync]: false } },
    ]);
    expect(merged.plugins).toEqual({
      [AT2_BUILTIN_PLUGIN_ID.telemetry]: { dir: "t1" },
    });
  });

  test("preserves cross-host plugin entries (shared file)", () => {
    const merged = mergeAt2AppConfigLayers([
      {
        plugins: {
          [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
          [AT2_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: "b.sqlite" },
        },
      },
    ]);
    expect(merged.plugins).toEqual({
      [AT2_BUILTIN_PLUGIN_ID.profileSync]: { filePath: "p.json" },
      [AT2_BUILTIN_PLUGIN_ID.inboxBuffer]: { dbPath: "b.sqlite" },
    });
  });

  test("ignores non-object layers", () => {
    const merged = mergeAt2AppConfigLayers([null, undefined, "x", { baseUrl: "http://a" }]);
    expect(merged).toEqual({ baseUrl: "http://a" });
  });
});
