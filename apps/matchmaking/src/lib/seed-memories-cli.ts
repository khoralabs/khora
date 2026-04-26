import { getNegotiationModel } from "./matchmaking-obp/index.ts";
import { createMatchmakingMemoriesBundle } from "./memories/create-memories-bundle.ts";
import { getMatchmakingEmbeddingModel } from "./memories/matchmaking-embedding.ts";
import { resolveMemoriesDbPath, resolveMemoriesRoot } from "./memories/persisted-memories.ts";
import { seedAllMatchmakingPersonaMemories } from "./memories/seed-personas.ts";

async function main(): Promise<void> {
  const memoriesRoot = resolveMemoriesRoot();
  const dbPath = resolveMemoriesDbPath(memoriesRoot);
  const bundle = createMatchmakingMemoriesBundle(dbPath, { memoriesRoot, domainLexicalStore: true });
  const chatModel = getNegotiationModel();
  const embeddingModel = getMatchmakingEmbeddingModel();

  console.log("[seed-memories] SQLite", dbPath);
  await seedAllMatchmakingPersonaMemories({
    bundle,
    chatModel,
    embeddingModel,
    skipExistingSlots: true,
  });
  console.log("[seed-memories] done (all registered personas)");
}

await main();
