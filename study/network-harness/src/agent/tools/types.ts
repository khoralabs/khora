import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

import type { SkillRecord } from "../skills.ts";

export type HarnessToolkitEnv = {
  memoriesClient?: RemoteMemoriesClientAsync;
  embeddingModel?: EmbeddingModel;
  embeddingCache?: Map<string, number[]>;
  memoriesSnapshotRootHex?: string;
  skills: SkillRecord[];
  activatedSkillNames: Set<string>;
};
