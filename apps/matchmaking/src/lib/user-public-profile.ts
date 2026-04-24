import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LanguageModel } from "ai";
import { getNegotiationModel } from "./matchmaking-obp/index.ts";
import { appUserMemoryNamespace } from "./memories/app-user-memory-namespace.ts";
import { createMatchmakingMemoriesBundle } from "./memories/create-memories-bundle.ts";
import { getMatchmakingEmbeddingModel } from "./memories/matchmaking-embedding.ts";
import { matchmakingGlobalMemoryNamespace } from "./memories/matchmaking-global-memory-namespace.ts";
import { mergeMeetingDomainPayloadIntoNamespace } from "./memories/merge-meeting-payload.ts";
import type { MeetingSeedPayload } from "./memories/meeting-seed-payload.ts";
import { resolveMemoriesDbPath, resolveMemoriesRoot } from "./memories/persisted-memories.ts";
import { resolveMatchmakingSubjectId } from "./resolve-subject-id.ts";
import { z } from "zod";

export const APP_USER_PUBLIC_SLUG = "_user_";

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
  return `live/public-profile/${APP_USER_PUBLIC_SLUG}`;
}

export function readUserPublicProfileState(): UserPublicProfileBody | null {
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
 * Merges `public_profile` into `_global_` and the app user namespace; writes JSON for reliable GET.
 */
export async function saveUserPublicProfileToMemories(
  body: UserPublicProfileBody,
  model?: LanguageModel,
): Promise<void> {
  const root = resolveMemoriesRoot();
  const db = resolveMemoriesDbPath(root);
  const bundle = createMatchmakingMemoriesBundle(db, { memoriesRoot: root });
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
  const gNs = matchmakingGlobalMemoryNamespace();
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
  const outPath = userPublicProfileStatePath(root);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

export function getUserPublicProfileForApi(): UserPublicProfileBody {
  return readUserPublicProfileState() ?? { displayName: "", tagline: "", about: "" };
}
