import { describe, expect, test } from "bun:test";
import type { MatchmakingScenario } from "../scenarios/matchmaking-scenario.ts";
import type { MatchmakingMemoriesBundle } from "./create-memories-bundle.ts";
import {
  matchmakingPublicProfileSeedMemoryKey,
  matchmakingSeedMemoryKey,
  matchmakingUserPublicProfileMemoryKey,
  namespaceSeedSlotsSatisfied,
  scenarioPersonaSeedSlotsSatisfied,
} from "./persisted-memories.ts";

function mockBundle(keysByNs: Map<string, Set<string>>): MatchmakingMemoriesBundle {
  return {
    persistence: {
      findMemoryIdByKey(namespace: string, key: string): string | undefined {
        const set = keysByNs.get(namespace);
        if (set?.has(key)) {
          return `id:${namespace}:${key}`;
        }
        return undefined;
      },
    },
  } as MatchmakingMemoriesBundle;
}

describe("seed slot detection", () => {
  test("public profile key helpers are stable", () => {
    expect(matchmakingPublicProfileSeedMemoryKey("p1")).toBe("seed/public-profile/p1");
    expect(matchmakingUserPublicProfileMemoryKey()).toBe("live/public-profile/_user_");
  });

  test("namespaceSeedSlotsSatisfied requires every seed-N key", () => {
    const keys = new Map<string, Set<string>>([["party_a_ns", new Set()]]);
    let bundle = mockBundle(keys);
    expect(namespaceSeedSlotsSatisfied(bundle, "party_a_ns", 2)).toBe(false);

    keys.get("party_a_ns")?.add(matchmakingSeedMemoryKey(0));
    bundle = mockBundle(keys);
    expect(namespaceSeedSlotsSatisfied(bundle, "party_a_ns", 2)).toBe(false);

    keys.get("party_a_ns")?.add(matchmakingSeedMemoryKey(1));
    bundle = mockBundle(keys);
    expect(namespaceSeedSlotsSatisfied(bundle, "party_a_ns", 2)).toBe(true);
    expect(namespaceSeedSlotsSatisfied(bundle, "party_a_ns", 0)).toBe(true);
  });

  test("scenarioPersonaSeedSlotsSatisfied checks both party namespaces", () => {
    const keys = new Map<string, Set<string>>([
      ["ns_req", new Set()],
      ["ns_rec", new Set()],
    ]);
    const scenario = {
      title: "t",
      parties: [],
      personaSeeds: [
        [{ kind: "meeting_intent" as const, text: "a" }],
        [{ kind: "meeting_intent" as const, text: "b" }],
      ],
      partyMemoryNamespaces: ["ns_req", "ns_rec"] as [string, string],
    } as MatchmakingScenario;

    let bundle = mockBundle(keys);
    expect(scenarioPersonaSeedSlotsSatisfied(bundle, scenario)).toBe(false);

    keys.get("ns_req")?.add(matchmakingSeedMemoryKey(0));
    bundle = mockBundle(keys);
    expect(scenarioPersonaSeedSlotsSatisfied(bundle, scenario)).toBe(false);

    keys.get("ns_rec")?.add(matchmakingSeedMemoryKey(0));
    bundle = mockBundle(keys);
    expect(scenarioPersonaSeedSlotsSatisfied(bundle, scenario)).toBe(true);
  });
});
