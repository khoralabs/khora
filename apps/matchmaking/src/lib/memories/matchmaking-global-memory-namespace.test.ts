import { expect, test } from "bun:test";
import { matchmakingGlobalMemoryNamespace } from "./matchmaking-global-memory-namespace.ts";
import {
  matchmakingFeedbackMemoryNamespace,
  matchmakingPersonalMemoryNamespace,
} from "./matchmaking-memory-namespaces.ts";
import { matchmakingSharedPublicProfilesNamespace } from "./matchmaking-shared-public-profiles-namespace.ts";
import { zMeetingSeedPayload } from "./meeting-seed-payload.ts";

test("global namespace path aliases shared public namespace", () => {
  expect(matchmakingGlobalMemoryNamespace("x-1")).toBe("obp_demo/matchmaking/public_profiles/_global_");
});

test("shared public profiles namespace path is cross-subject _global_ segment", () => {
  expect(matchmakingSharedPublicProfilesNamespace()).toBe(
    "obp_demo/matchmaking/public_profiles/_global_",
  );
});

test("personal and feedback namespaces are cross-subject per-user", () => {
  expect(matchmakingPersonalMemoryNamespace("p1")).toBe("obp_demo/matchmaking/users/p1/personal");
  expect(matchmakingFeedbackMemoryNamespace("p1")).toBe("obp_demo/matchmaking/users/p1/feedback");
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
