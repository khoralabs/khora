import { getNegotiationModel } from "./matchmaking-obp/index.ts";
import { createMatchmakingMemoriesBundle } from "./memories/create-memories-bundle.ts";
import { getMatchmakingEmbeddingModel } from "./memories/matchmaking-embedding.ts";
import {
  resolveObpDemoMemoriesDbPath,
  resolveObpDemoMemoriesRoot,
} from "./memories/persisted-memories.ts";
import { seedAllMatchmakingPersonaMemories } from "./memories/seed-personas.ts";

async function main(): Promise<void> {
  const memoriesRoot = resolveObpDemoMemoriesRoot();
  const dbPath = resolveObpDemoMemoriesDbPath(memoriesRoot);
  const bundle = createMatchmakingMemoriesBundle(dbPath);
  const chatModel = getNegotiationModel();
  const embeddingModel = getMatchmakingEmbeddingModel();

  console.log("[seed-memories] SQLite", dbPath);
  await seedAllMatchmakingPersonaMemories({ bundle, chatModel, embeddingModel, memoriesRoot });
  console.log("[seed-memories] done (all registered personas)");
}

await main();
