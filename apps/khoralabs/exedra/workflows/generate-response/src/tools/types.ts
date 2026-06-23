import type { GenerateResponsePolicyState } from "../policies/types.ts";
import type { SkillRecord } from "../skills/registry.ts";

export type MemorySearchHit = {
  namespace: string;
  key: string;
  snippet: string;
  score?: number;
  provenance?: unknown;
};

export type MemoryClient = {
  searchMemories(input: { namespace: string; query: string }): Promise<MemorySearchHit[]>;
  getMemoryProvenance(input: { namespace: string; key: string }): Promise<unknown>;
};

export type GenerateResponseToolkitEnv = {
  policyState: GenerateResponsePolicyState;
  memoryClient: MemoryClient;
  skills: SkillRecord[];
  activatedSkillNames: Set<string>;
};
