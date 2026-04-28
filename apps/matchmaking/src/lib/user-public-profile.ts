import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { getMatchmakingDomainRuntime } from "./domain/runtime/index.ts";
import { getNegotiationModel } from "./matchmaking-obp/index.ts";
import { appUserMemoryNamespace } from "./memories/app-user-memory-namespace.ts";
import { createMatchmakingMemoriesBundle } from "./memories/create-memories-bundle.ts";
import { getMatchmakingEmbeddingModel } from "./memories/matchmaking-embedding.ts";
import { matchmakingSharedPublicProfilesNamespace } from "./memories/matchmaking-shared-public-profiles-namespace.ts";
import type { MeetingSeedPayload } from "./memories/meeting-seed-payload.ts";
import { mergeMeetingDomainPayloadIntoNamespace } from "./memories/merge-meeting-payload.ts";
import {
  APP_USER_PUBLIC_SLUG,
  matchmakingUserPublicProfileMemoryKey,
  resolveMemoriesDbPath,
  resolveMemoriesRoot,
} from "./memories/persisted-memories.ts";
import { resolveMatchmakingSubjectId } from "./resolve-subject-id.ts";

export const zUserPublicProfileBody = z.object({
  displayName: z.string().trim().min(1).max(200),
  tagline: z.string().max(500),
  about: z.string().max(8000),
});

export type UserPublicProfileBody = z.infer<typeof zUserPublicProfileBody>;

export function userPublicProfileStatePath(memoriesRoot: string): string {
  return join(memoriesRoot, "user-public-profile.json");
}

export function userPublicProfileMemoryKey(): string {
  return matchmakingUserPublicProfileMemoryKey();
}

function readLegacyUserPublicProfileJson(): UserPublicProfileBody | null {
  const path = userPublicProfileStatePath(resolveMemoriesRoot());
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return zUserPublicProfileBody.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Public profile for API / directory: domain DB first, then one-time legacy JSON migration.
 */
export function readUserPublicProfileState(): UserPublicProfileBody | null {
  const subjectId = resolveMatchmakingSubjectId();
  const fields = getMatchmakingDomainRuntime().persistence.getProfile(subjectId);
  if (fields !== null) {
    return {
      displayName: fields.displayName,
      tagline: fields.tagline,
      about: fields.about,
    };
  }
  const legacy = readLegacyUserPublicProfileJson();
  if (legacy !== null) {
    getMatchmakingDomainRuntime().persistence.upsertProfile(subjectId, legacy);
    try {
      unlinkSync(userPublicProfileStatePath(resolveMemoriesRoot()));
    } catch {
      /* ignore */
    }
    return legacy;
  }
  return null;
}

/**
 * Merges `public_profile` into shared namespace and app user namespace; persists profile in domain DB.
 */
export async function saveUserPublicProfileToMemories(
  body: UserPublicProfileBody,
  model?: LanguageModel,
): Promise<void> {
  const subjectId = resolveMatchmakingSubjectId();
  getMatchmakingDomainRuntime().persistence.upsertProfile(subjectId, {
    displayName: body.displayName,
    tagline: body.tagline,
    about: body.about,
  });
  const root = resolveMemoriesRoot();
  const memDb = resolveMemoriesDbPath(root);
  const bundle = createMatchmakingMemoriesBundle(memDb, {
    memoriesRoot: root,
    domainLexicalStore: true,
  });
  const chatModel = model ?? getNegotiationModel();
  const embeddingModel = getMatchmakingEmbeddingModel();
  const payload: MeetingSeedPayload = {
    kind: "public_profile",
    slug: APP_USER_PUBLIC_SLUG,
    displayName: body.displayName,
    tagline: body.tagline,
    about: body.about,
  };
  const key = userPublicProfileMemoryKey();
  const gNs = matchmakingSharedPublicProfilesNamespace();
  const uNs = appUserMemoryNamespace();
  const correlation = `user-public-profile-${resolveMatchmakingSubjectId()}`;
  await Promise.all([
    mergeMeetingDomainPayloadIntoNamespace({
      bundle,
      chatModel,
      embeddingModel,
      namespace: gNs,
      memoryKey: key,
      domainPayload: payload,
      correlationId: `${correlation}-global`,
    }),
    mergeMeetingDomainPayloadIntoNamespace({
      bundle,
      chatModel,
      embeddingModel,
      namespace: uNs,
      memoryKey: key,
      domainPayload: payload,
      correlationId: `${correlation}-user`,
    }),
  ]);
  try {
    const legacyPath = userPublicProfileStatePath(root);
    if (existsSync(legacyPath)) {
      unlinkSync(legacyPath);
    }
  } catch {
    /* ignore */
  }
}

export function getUserPublicProfileForApi(): UserPublicProfileBody {
  return readUserPublicProfileState() ?? { displayName: "", tagline: "", about: "" };
}
