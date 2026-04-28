import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import type { LanguageModel } from "ai";
import { type MatchmakingPersonaSlug, matchmakingPersonas } from "../personas/index.ts";
import type { MatchmakingPersona } from "../personas/types.ts";
import type { MatchmakingMemoriesBundle } from "./create-memories-bundle.ts";
import { matchmakingSharedPublicProfilesNamespace } from "./matchmaking-shared-public-profiles-namespace.ts";
import type { MeetingSeedPayload } from "./meeting-seed-payload.ts";
import { mergeMeetingDomainPayloadIntoNamespace } from "./merge-meeting-payload.ts";
import {
  matchmakingPublicProfileSeedMemoryKey,
  matchmakingSeedMemoryKey,
} from "./persisted-memories.ts";

const PUBLIC_PROFILE_SEED_SLUGS: readonly MatchmakingPersonaSlug[] = ["p1", "p2", "p3"];

/** Adapter → integrator pipeline per seed (same as matchmaking session seed path). */
export async function seedPersonaMemoryNamespace(args: {
  bundle: MatchmakingMemoriesBundle;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  namespace: string;
  seeds: readonly MeetingSeedPayload[];
  /** When true, skip adapter/integrator for slots that already have a memory at {@link matchmakingSeedMemoryKey}. */
  skipExistingSlots?: boolean;
}): Promise<void> {
  const { bundle, chatModel, embeddingModel, namespace, seeds, skipExistingSlots } = args;

  for (let index = 0; index < seeds.length; index++) {
    const payload = seeds[index];
    if (payload === undefined) {
      continue;
    }
    const slotKey = matchmakingSeedMemoryKey(index);
    if (
      skipExistingSlots === true &&
      bundle.persistence.findMemoryIdByKey(namespace, slotKey) !== undefined
    ) {
      continue;
    }
    await mergeMeetingDomainPayloadIntoNamespace({
      bundle,
      chatModel,
      embeddingModel,
      namespace,
      memoryKey: slotKey,
      domainPayload: payload,
      correlationId: `seed-${namespace}-${index}`,
    });
  }
}

/**
 * Offline seeds: one `public_profile` memory per simulated persona into shared namespace.
 */
export async function seedGlobalPublicProfiles(args: {
  bundle: MatchmakingMemoriesBundle;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  /** When true, skip seeds whose memory key already exists in `_global_`. */
  skipExistingSlots?: boolean;
}): Promise<void> {
  const { bundle, chatModel, embeddingModel, skipExistingSlots } = args;
  const namespace = matchmakingSharedPublicProfilesNamespace();
  for (const slug of PUBLIC_PROFILE_SEED_SLUGS) {
    const p = matchmakingPersonas[slug];
    const memoryKey = matchmakingPublicProfileSeedMemoryKey(slug);
    if (
      skipExistingSlots === true &&
      bundle.persistence.findMemoryIdByKey(namespace, memoryKey) !== undefined
    ) {
      continue;
    }
    const domainPayload: MeetingSeedPayload = {
      kind: "public_profile",
      slug: p.slug,
      displayName: p.displayName,
      tagline: p.profile.tagline,
      about: p.profile.about,
    };
    await mergeMeetingDomainPayloadIntoNamespace({
      bundle,
      chatModel,
      embeddingModel,
      namespace,
      memoryKey,
      domainPayload,
      correlationId: `seed-global-public-${namespace}-${slug}`,
    });
  }
}

/**
 * Seeds every registered persona in {@link matchmakingPersonas} into SQLite.
 * JSONL under the memories root is updated incrementally via {@link MatchmakingMemoriesBundle}
 * (created with {@code createMatchmakingMemoriesBundle} — app code uses
 * {@code domainLexicalStore: true}; tests may omit it for per-namespace {@code JsonlStore} paths).
 */
export async function seedAllMatchmakingPersonaMemories(args: {
  bundle: MatchmakingMemoriesBundle;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  personas?: readonly MatchmakingPersona[];
  /** When true, skip LLM work for seed slots that already exist (repair partial runs). */
  skipExistingSlots?: boolean;
}): Promise<void> {
  const personas = args.personas ?? (Object.values(matchmakingPersonas) as MatchmakingPersona[]);
  const { bundle, chatModel, embeddingModel, skipExistingSlots } = args;
  await Promise.all(
    personas.map((p) =>
      seedPersonaMemoryNamespace({
        bundle,
        chatModel,
        embeddingModel,
        namespace: p.memoryNamespace,
        seeds: p.memorySeeds,
        skipExistingSlots,
      }),
    ),
  );
  await seedGlobalPublicProfiles({
    bundle,
    chatModel,
    embeddingModel,
    skipExistingSlots,
  });
}

/**
 * Adapter → integrator pipeline per seed (same as CLI todo-add), in order: all requester memories, then requestee.
 */
export async function seedMatchmakingPersonas(args: {
  bundle: MatchmakingMemoriesBundle;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  partyMemoryNamespaces: readonly [string, string];
  personaSeeds: readonly [MeetingSeedPayload[], MeetingSeedPayload[]];
  skipExistingSlots?: boolean;
}): Promise<void> {
  const {
    bundle,
    chatModel,
    embeddingModel,
    partyMemoryNamespaces,
    personaSeeds,
    skipExistingSlots,
  } = args;
  const [nsA, nsB] = partyMemoryNamespaces;
  const [seedsA, seedsB] = personaSeeds;
  await Promise.all([
    seedPersonaMemoryNamespace({
      bundle,
      chatModel,
      embeddingModel,
      namespace: nsA,
      seeds: seedsA,
      skipExistingSlots,
    }),
    seedPersonaMemoryNamespace({
      bundle,
      chatModel,
      embeddingModel,
      namespace: nsB,
      seeds: seedsB,
      skipExistingSlots,
    }),
  ]);
}

export { matchmakingSeedMemoryKey } from "./persisted-memories.ts";
