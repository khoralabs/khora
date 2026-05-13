import { describe, expect, test } from "bun:test";
import {
  computePostAttachScopes,
  computeProfileAttachScopes,
} from "./atrium-memory-scopes.ts";

describe("atrium-memory-scopes", () => {
  test("computeProfileAttachScopes", () => {
    const pid = "atrium_profile_aaaaaaaaaaaaaaaaaaaaaaaa";
    expect(computeProfileAttachScopes(pid)).toEqual(["atrium", `atrium/${pid}`]);
  });

  test("computePostAttachScopes orders topic slugs and dedupes", () => {
    const pid = "atrium_profile_bbbbbbbbbbbbbbbbbbbbbbbb";
    const scopes = computePostAttachScopes(pid, ["zebra", "#apple", "apple"]);
    expect(scopes).toEqual([
      "atrium",
      `atrium/${pid}`,
      "atrium/apple",
      "atrium/zebra",
      `atrium/${pid}/apple`,
      `atrium/${pid}/zebra`,
    ]);
  });

  test("computePostAttachScopes without author keeps only app root", () => {
    expect(computePostAttachScopes(undefined, ["x"])).toEqual(["atrium"]);
  });
});
