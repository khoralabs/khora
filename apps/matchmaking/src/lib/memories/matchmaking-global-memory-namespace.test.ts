import { expect, test } from "bun:test";
import { zMeetingSeedPayload } from "./meeting-seed-payload.ts";
import { matchmakingGlobalMemoryNamespace } from "./matchmaking-global-memory-namespace.ts";

test("global namespace path is subject _global_ segment", () => {
  expect(matchmakingGlobalMemoryNamespace("x-1")).toBe("obp_demo/matchmaking/subjects/x-1/_global_");
});

test("zMeetingSeedPayload accepts public_profile", () => {
  const p = zMeetingSeedPayload.parse({
    kind: "public_profile",
    slug: "p1",
    displayName: "Name",
    tagline: "Tag",
    about: "About",
  });
  expect(p.kind).toBe("public_profile");
});
