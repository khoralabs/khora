import { describe, expect, test } from "bun:test";
import {
  agentScope,
  PROFILE_MEMORY_KEY,
  postAttachScopes,
  postsMemoryNamespace,
  profileMemoryNamespace,
  topicScope,
} from "./khora-namespace.ts";
import { DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT } from "./memories-config.ts";

describe("khora-namespace", () => {
  const root = DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
  const profileId = "prof-abc-123";

  test("builds hierarchical paths under global root", () => {
    expect(agentScope(root, profileId)).toBe("global/agents/prof-abc-123");
    expect(profileMemoryNamespace(root, profileId)).toBe("global/agents/prof-abc-123/profile");
    expect(postsMemoryNamespace(root, profileId)).toBe("global/agents/prof-abc-123/posts");
    expect(topicScope(root, profileId, "design")).toBe("global/agents/prof-abc-123/topics/design");
  });

  test("postAttachScopes includes agent and topic scopes", () => {
    const scopes = postAttachScopes(root, profileId, ["design", "ai"]);
    expect(scopes).toContain("global/agents/prof-abc-123");
    expect(scopes).toContain("global/agents/prof-abc-123/topics/design");
    expect(scopes).toContain("global/agents/prof-abc-123/topics/ai");
  });

  test("profile memory key is self", () => {
    expect(PROFILE_MEMORY_KEY).toBe("self");
  });
});
